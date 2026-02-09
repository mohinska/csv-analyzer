"""
Planner Agent - main orchestrator that handles user requests using tool-use.

Responsibilities:
1. Receives user messages and data context
2. Decides what actions to take (query, plot, respond)
3. Delegates code generation to QueryMaker
4. Executes code via QueryExecutor
5. Streams events to frontend
"""
import uuid
from typing import AsyncGenerator, Optional, TYPE_CHECKING
from pathlib import Path
import pandas as pd

from backend.llm.anthropic_llm import AnthropicLLM, PLANNER_TOOLS
from backend.agents.query_maker import QueryMaker
from backend.services.query_executor import QueryExecutor
from backend.services.metrics_evaluator import MetricsEvaluator, MetricsReport, get_metrics_evaluator
from backend.services.llm_judge import LLMJudge
from backend.models.planner_models import ChatEvent, ToolCall, PlotInfo, PlannerState, AnswerType
from backend.agents.prompt_polisher import PromptPolisher, PromptType

if TYPE_CHECKING:
    from backend.services.session_manager import SessionManager


def safe_print(msg: str, **kwargs) -> None:
    """Print message safely, handling Unicode encoding errors on Windows."""
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        # Replace problematic characters and retry
        print(msg.encode('ascii', errors='replace').decode('ascii'), flush=True)


class PlannerAgent:
    """
    Main orchestrator agent that handles user requests using tool-use.

    The planner receives user requests along with data context and decides
    what actions to take (query, plot, respond) until calling finish().
    """
    MAX_ITERATIONS = 10  # Prevent infinite loops

    def __init__(
        self,
        llm: AnthropicLLM,
        query_maker: QueryMaker,
        query_executor: QueryExecutor,
        metrics_evaluator: Optional[MetricsEvaluator] = None,
        judge: Optional[LLMJudge] = None,
        prompt_polisher: Optional["PromptPolisher"] = None,
    ):
        self.llm = llm
        self.query_maker = query_maker
        self.query_executor = query_executor
        self.metrics = metrics_evaluator or get_metrics_evaluator()
        self.judge = judge
        self.prompt_polisher = prompt_polisher
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self) -> str:
        """Load system prompt from file."""
        prompt_path = Path(__file__).parent.parent / "prompts" / "planner_system.txt"
        try:
            return prompt_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return self._default_system_prompt()

    def _default_system_prompt(self) -> str:
        return """You are a data analysis assistant that helps users explore CSV datasets.

You have access to these tools:

1. **write_to_chat(text)** - Send messages to the user
2. **generate_query(intent)** - Run pandas operations on the data
3. **create_plot(plot_type, title, ...)** - Generate visualizations
4. **finish()** - End the current turn (REQUIRED when done)

Guidelines:
- Always call finish() when done
- Use write_to_chat for all user-facing output
- Be concise but informative
- Handle errors gracefully"""

    def _build_data_context(self, df: pd.DataFrame, filename: str) -> str:
        """Build efficient data context for the planner."""
        lines = []

        lines.append(f"Dataset: {filename}")
        lines.append(f"Shape: {df.shape[0]} rows x {df.shape[1]} columns")
        lines.append("")

        lines.append("Columns:")
        for col in df.columns:
            dtype = str(df[col].dtype)
            if pd.api.types.is_numeric_dtype(df[col]):
                min_val, max_val = df[col].min(), df[col].max()
                lines.append(f"  - {col} ({dtype}): [{min_val} to {max_val}]")
            elif df[col].nunique() <= 10:
                cats = list(df[col].dropna().unique()[:5])
                lines.append(f"  - {col} ({dtype}): {cats}")
            else:
                sample = str(df[col].dropna().iloc[0])[:30] if len(df[col].dropna()) > 0 else "N/A"
                lines.append(f"  - {col} ({dtype}): e.g. \"{sample}\"")

        numeric_cols = df.select_dtypes(include=['number']).columns[:5]
        if len(numeric_cols) > 0:
            lines.append("")
            lines.append("Quick stats:")
            for col in numeric_cols:
                mean = df[col].mean()
                lines.append(f"  - {col}: mean={mean:.2f}")

        return "\n".join(lines)

    def _build_conversation_history(
        self,
        session_id: str,
        session_mgr: Optional["SessionManager"],
        max_turns: int = 10,
    ) -> list[dict]:
        """
        Build conversation history from saved chat messages for LLM context.

        Converts stored chat history into alternating user/assistant messages.
        Keeps last `max_turns` exchanges to stay token-efficient.
        Skips system messages, plot data, and internal prompts.
        """
        if not session_mgr:
            return []

        history = session_mgr.get_chat_history(session_id)
        if not history:
            return []

        # Filter to user and assistant text messages only
        # Skip the very last user message (it's the current request, added by routes.py before planner.run)
        relevant = []
        for msg in history:
            role = msg.get("role")
            text = msg.get("text", "").strip()
            msg_type = msg.get("type", "text")

            if not text or role not in ("user", "assistant"):
                continue
            if msg_type not in ("text",):
                continue
            # Skip internal system instructions that leaked into history
            if text.startswith("[INTERNAL SYSTEM INSTRUCTION"):
                continue
            relevant.append({"role": role, "text": text})

        if not relevant:
            return []

        # Remove the last user message — that's the current request being processed
        if relevant and relevant[-1]["role"] == "user":
            relevant = relevant[:-1]

        if not relevant:
            return []

        # Keep last N messages (user+assistant pairs count as 2)
        relevant = relevant[-(max_turns * 2):]

        # Merge consecutive same-role messages and build alternating format
        merged: list[dict] = []
        for msg in relevant:
            if merged and merged[-1]["role"] == msg["role"]:
                merged[-1]["content"] += "\n\n" + msg["text"]
            else:
                merged.append({"role": msg["role"], "content": msg["text"]})

        # Ensure messages start with "user" role (Anthropic API requirement)
        while merged and merged[0]["role"] != "user":
            merged.pop(0)

        # Ensure alternating user/assistant pattern
        cleaned: list[dict] = []
        for msg in merged:
            if cleaned and cleaned[-1]["role"] == msg["role"]:
                cleaned[-1]["content"] += "\n\n" + msg["content"]
            else:
                cleaned.append(msg)

        return cleaned

    @staticmethod
    def _pandas_to_sql_type(dtype: str) -> str:
        """Map pandas dtype to approximate SQL type for LLM context."""
        dtype = str(dtype).lower()
        if 'int' in dtype:
            return 'INTEGER'
        elif 'float' in dtype:
            return 'DOUBLE'
        elif 'bool' in dtype:
            return 'BOOLEAN'
        elif 'datetime' in dtype:
            return 'TIMESTAMP'
        elif 'date' in dtype:
            return 'DATE'
        else:
            return 'VARCHAR'

    def _summarize_for_query(self, df: pd.DataFrame) -> str:
        """
        Generate a minimal summary optimized for SQL query generation.
        Describes the table schema in SQL-friendly terms.
        """
        lines = []

        lines.append("Table: df")
        lines.append(f"Rows: {len(df)}")
        lines.append("")
        lines.append("Columns:")

        for col in df.columns:
            dtype = str(df[col].dtype)
            sql_type = self._pandas_to_sql_type(dtype)

            # Add range/categories for better query context
            if pd.api.types.is_numeric_dtype(df[col]):
                min_val = df[col].min()
                max_val = df[col].max()
                lines.append(f"  - {col} ({sql_type}): range [{min_val} to {max_val}]")
            elif df[col].nunique() <= 10:
                categories = df[col].dropna().unique().tolist()[:10]
                lines.append(f"  - {col} ({sql_type}): values {categories}")
            else:
                sample = str(df[col].dropna().iloc[0])[:30] if len(df[col].dropna()) > 0 else "N/A"
                lines.append(f"  - {col} ({sql_type}): e.g. \"{sample}\"")

        return "\n".join(lines)

    async def run(
        self,
        user_message: str,
        df: pd.DataFrame,
        filename: str,
        session_id: str,
        session_mgr: Optional["SessionManager"] = None,
        max_messages: int = 0,
    ) -> AsyncGenerator[ChatEvent, None]:
        """
        Run the planner agent loop.

        Yields ChatEvent objects as the agent processes the request.
        """
        import sys
        safe_print(f"[Planner] === RUN STARTED ===", flush=True)
        safe_print(f"[Planner] Message: '{user_message[:80]}...'", flush=True)
        safe_print(f"[Planner] DataFrame: {df.shape}", flush=True)
        sys.stdout.flush()

        # Explicit state object for this run
        current_df = df.copy()
        plots: list[PlotInfo] = []  # Keep typed list for .title access
        data_context = self._build_data_context(current_df, filename)
        state = PlannerState(
            user_message=user_message,
            data_summary=data_context,
        )

        # Step 1: Preprocess user prompt (validate, classify, refine)
        if self.prompt_polisher:
            yield ChatEvent(event_type="status", data={"message": "Analyzing prompt..."})
            polished = await self.prompt_polisher.polish(user_message, data_context)
            safe_print(f"[Planner] PromptPolisher: valid={polished.is_valid}, type={polished.prompt_type}, confidence={polished.confidence}")

            if not polished.is_valid:
                # Reject invalid prompt
                rejection = polished.rejection_reason or "This doesn't seem related to data analysis. Please ask about your data."
                yield ChatEvent(event_type="text", data={"text": rejection})
                if session_mgr:
                    session_mgr.add_chat_message(session_id, "assistant", rejection)
                yield ChatEvent(event_type="done", data={
                    "iterations": 0, "messages_sent": 1, "plots_created": 0,
                    "data_updated": False, "metrics": [], "judge": [], "suggestions": [],
                })
                return

            # Store preprocessing results in state
            state.prompt_type = polished.prompt_type.value
            state.polished_prompt = polished.polished_prompt

            # Map PromptType → AnswerType
            type_map = {
                PromptType.VISUALIZATION: AnswerType.SVG,
                PromptType.TRANSFORMATION: AnswerType.CSV,
            }
            state.answer_type = type_map.get(polished.prompt_type, AnswerType.TEXT)

            # Use polished prompt for the LLM
            user_message = polished.polished_prompt

        # Get existing plots for dedup
        existing_plots_info = ""
        if session_mgr:
            existing_plots = session_mgr.get_plots(session_id)
            if existing_plots:
                titles = [p.get("title", "Untitled") for p in existing_plots]
                existing_plots_info = f"\n\nEXISTING PLOTS (already created — do NOT recreate these. If user asks for a similar plot, tell them it already exists instead of creating a duplicate):\n" + "\n".join(f"- {t}" for t in titles)

        # Build conversation history from previous messages
        history_messages = self._build_conversation_history(session_id, session_mgr)
        safe_print(f"[Planner] Loaded {len(history_messages)} history messages")

        # Initialize messages: data context as first user message, then history, then current request
        messages = [{
            "role": "user",
            "content": f"""DATA CONTEXT:
{data_context}{existing_plots_info}

Respond with "Understood." and wait for the user's request."""
        }, {
            "role": "assistant",
            "content": "Understood."
        }]

        # Inject conversation history (already in user/assistant alternating format)
        if history_messages:
            messages.extend(history_messages)
            # If history ends with user message, we need an assistant reply before adding current user msg
            if messages[-1]["role"] == "user":
                messages.append({"role": "assistant", "content": "Understood. What would you like to know next?"})

        # Add current user request
        messages.append({
            "role": "user",
            "content": f"""{user_message}

Use the available tools to fulfill this request. Always call finish() when done."""
        })

        while state.iteration < self.MAX_ITERATIONS and not state.finished:
            state.iteration += 1

            # Emit status update
            if state.iteration == 1:
                yield ChatEvent(event_type="status", data={"message": "Analyzing request..."})
            else:
                yield ChatEvent(event_type="status", data={"message": "Planning next step..."})

            # Call LLM with tools
            try:
                safe_print(f"[Planner] Iteration {state.iteration}: calling LLM...", flush=True)
                response = await self.llm.generate_with_tools(
                    messages=messages,
                    tools=PLANNER_TOOLS,
                    system=self.system_prompt,
                )
                safe_print(f"[Planner] LLM responded with {len(response.content)} blocks, stop_reason={response.stop_reason}", flush=True)
            except Exception as e:
                import traceback
                safe_print(f"[Planner] LLM error: {e}")
                traceback.print_exc()
                yield ChatEvent(
                    event_type="error",
                    data={"message": f"LLM error: {str(e)}"}
                )
                break

            # Process response content blocks
            assistant_content = []
            tool_calls = []

            for block in response.content:
                safe_print(f"[Planner] Processing block: type={block.type}")
                if block.type == "text":
                    assistant_content.append({"type": "text", "text": block.text})
                    safe_print(f"[Planner] Text block: {block.text[:100]}...")

                elif block.type == "tool_use":
                    safe_print(f"[Planner] Tool call: {block.name} with input: {block.input}")
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    })
                    tool_calls.append(ToolCall(
                        id=block.id,
                        name=block.name,
                        input=block.input
                    ))

            # Add assistant message to history
            messages.append({
                "role": "assistant",
                "content": assistant_content
            })

            # Yield any text blocks that accompany tool calls
            # (LLM sometimes puts user-facing text in a text block instead of write_to_chat)
            if tool_calls:
                for block in response.content:
                    if block.type == "text" and block.text.strip():
                        # Only yield if no write_to_chat call in this batch (avoid duplicates)
                        has_write_to_chat = any(tc.name == "write_to_chat" for tc in tool_calls)
                        if not has_write_to_chat:
                            yield ChatEvent(event_type="text", data={"text": block.text})
                            state.chat_messages.append(block.text)
                            if session_mgr:
                                session_mgr.add_chat_message(session_id, "assistant", block.text)
                        break  # Only yield the first text block

            # Process tool calls
            if tool_calls:
                tool_results = []

                for tool_call in tool_calls:
                    # Emit status updates for long operations
                    if tool_call.name == "generate_query":
                        yield ChatEvent(event_type="status", data={"message": "Generating code..."})
                    elif tool_call.name == "create_plot":
                        yield ChatEvent(event_type="status", data={"message": "Creating visualization..."})
                        plot_title = tool_call.input.get("title", "chart")
                        yield ChatEvent(
                            event_type="plot_creating",
                            data={"title": plot_title}
                        )

                    # Execute tool
                    result = await self._execute_tool(
                        name=tool_call.name,
                        input=tool_call.input,
                        df=current_df,
                        session_id=session_id,
                        session_mgr=session_mgr,
                        chat_messages=state.chat_messages,
                        plots=plots,
                        user_message=user_message,
                    )

                    # Update state based on result
                    if result.get("new_df") is not None:
                        current_df = result["new_df"]
                        state.data_updated = True
                        state.data_ver += 1
                        # Persist transformed dataframe to session
                        if session_mgr:
                            session_mgr.save_transformed_dataframe(session_id, current_df)

                    if result.get("finished"):
                        state.finished = True

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_call.id,
                        "content": result["content"],
                        "is_error": result.get("is_error", False)
                    })

                    # Collect metrics from tool result
                    if result.get("metrics"):
                        state.run_metrics.append(result["metrics"])

                    # Track last query result for hallucination checks + judge
                    if tool_call.name == "generate_query" and result.get("result_preview"):
                        state.last_query_result = result["result_preview"]
                        state.query_results.append(result["result_preview"])

                    # Yield events based on tool type
                    if tool_call.name == "write_to_chat":
                        chat_text = tool_call.input.get("text", "")
                        # Hallucination check: log only, don't feed back to LLM
                        # (feeding FAIL back causes LLM to duplicate messages)
                        if state.last_query_result and chat_text:
                            hall_report = self.metrics.evaluate_chat_text(
                                chat_text, state.last_query_result
                            )
                            state.run_metrics.append(hall_report.to_dict())
                            if not hall_report.all_passed:
                                safe_print(f"[Planner] Hallucination check (info only): {hall_report.to_feedback()}")

                        yield ChatEvent(
                            event_type="text",
                            data={"text": chat_text}
                        )

                        # LLM Judge: evaluate response quality
                        if self.judge and state.last_query_result and chat_text:
                            verdict = await self.judge.evaluate_response(
                                user_question=user_message,
                                query_result=state.last_query_result,
                                assistant_response=chat_text,
                                data_context=data_context,
                            )
                            state.judge_verdicts.append(verdict.model_dump())
                            state.run_metrics.append({"judge_response": verdict.model_dump()})

                            if verdict.verdict == "retry":
                                safe_print(f"[Planner] Judge RETRY (logged, no injection): {verdict.feedback}")
                            elif verdict.verdict == "warn":
                                safe_print(f"[Planner] Judge WARN: {verdict.feedback}")

                            yield ChatEvent(
                                event_type="judge",
                                data=verdict.model_dump(),
                            )
                        # Enforce message cap for internal requests
                        if max_messages and len(state.chat_messages) >= max_messages:
                            safe_print(f"[Planner] Message cap reached ({max_messages}), forcing finish.")
                            state.finished = True
                            break

                    elif tool_call.name == "generate_query":
                        if result.get("is_error"):
                            yield ChatEvent(event_type="status", data={"message": "Retrying with a different approach..."})
                        yield ChatEvent(
                            event_type="query_result",
                            data={
                                "intent": tool_call.input.get("intent"),
                                "result": result["content"],
                                "is_error": result.get("is_error", False)
                            }
                        )
                        # Auto-notify user about data transformations
                        if result.get("transformation_summary"):
                            yield ChatEvent(
                                event_type="text",
                                data={"text": result["transformation_summary"]}
                            )
                    elif tool_call.name == "create_plot":
                        safe_print(f"[Planner] create_plot result: is_error={result.get('is_error')}, has_plot_info={result.get('plot_info') is not None}")
                        if not result.get("is_error") and result.get("plot_info"):
                            plot = result["plot_info"]
                            safe_print(f"[Planner] Yielding plot event: id={plot.id}, title={plot.title}, chart_data_len={len(plot.chart_data) if plot.chart_data else 0}")
                            yield ChatEvent(
                                event_type="plot",
                                data={
                                    "id": plot.id,
                                    "title": plot.title,
                                    "columns_used": plot.columns_used,
                                    "summary": plot.summary,
                                    "chart_config": plot.chart_config.model_dump() if plot.chart_config else None,
                                    "chart_data": plot.chart_data,
                                    "code_snippet": plot.code_snippet,
                                }
                            )
                        elif result.get("is_error"):
                            safe_print(f"[Planner] create_plot error: {result['content']}")
                            yield ChatEvent(
                                event_type="error",
                                data={"message": result["content"]}
                            )
                        else:
                            safe_print(f"[Planner] create_plot: no error but no plot_info! Full result: {result}")

                # Add tool results to messages
                messages.append({
                    "role": "user",
                    "content": tool_results
                })

            # Check for stop condition
            if response.stop_reason == "end_turn" and not tool_calls:
                # If LLM returned text without tools, yield that text to user
                for block in response.content:
                    if block.type == "text" and block.text.strip():
                        yield ChatEvent(
                            event_type="text",
                            data={"text": block.text}
                        )
                        state.chat_messages.append(block.text)
                        # Save to chat history
                        if session_mgr:
                            session_mgr.add_chat_message(session_id, "assistant", block.text)
                break

        # Safety net: if the agent finished without sending any text or plots to the user,
        # send a fallback message so the user always gets a response
        if not state.chat_messages and not plots:
            safe_print(f"[Planner] WARNING: Agent finished without any user-visible output! Sending fallback.")
            fallback_text = "I wasn't able to produce a response for that request. Could you try rephrasing your question?"
            yield ChatEvent(event_type="text", data={"text": fallback_text})
            if session_mgr:
                session_mgr.add_chat_message(session_id, "assistant", fallback_text)

        # LLM Judge: evaluate the complete turn
        turn_verdict = None
        if self.judge and state.chat_messages:
            yield ChatEvent(event_type="status", data={"message": "Evaluating response quality..."})
            turn_verdict = await self.judge.evaluate_turn(
                user_question=user_message,
                all_messages=state.chat_messages,
                all_query_results=state.query_results,
                plots_created=[p.title for p in plots],
            )
            state.judge_verdicts.append({"turn": turn_verdict.model_dump()})
            state.run_metrics.append({"judge_turn": turn_verdict.model_dump()})
            yield ChatEvent(event_type="judge", data={"turn": True, **turn_verdict.model_dump()})

        # Generate follow-up suggestions
        followup_suggestions = self._generate_followup_suggestions(
            current_df, state.chat_messages, plots, user_message
        )

        # Yield done event with metrics summary
        yield ChatEvent(
            event_type="done",
            data={
                "iterations": state.iteration,
                "messages_sent": len(state.chat_messages),
                "plots_created": len(plots),
                "data_updated": state.data_updated,
                "new_df": current_df if state.data_updated else None,
                "metrics": state.run_metrics,
                "judge": state.judge_verdicts,
                "suggestions": followup_suggestions,
            }
        )

    def _generate_followup_suggestions(
        self,
        df: pd.DataFrame,
        chat_messages: list[str],
        plots: list[PlotInfo],
        user_message: str,
    ) -> list[dict]:
        """Generate follow-up suggestions that are contextually relevant to the conversation."""
        suggestions = []
        all_cols = df.columns.tolist()
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        categorical_cols = [
            c for c in df.select_dtypes(exclude=['number']).columns
            if df[c].nunique() <= 20
        ]

        msg_lower = user_message.lower()
        all_text = " ".join(chat_messages).lower()

        # Extract columns that were actually mentioned in the response
        mentioned_cols = [c for c in all_cols if c.lower() in all_text]
        mentioned_numeric = [c for c in mentioned_cols if c in numeric_cols]
        mentioned_categorical = [c for c in mentioned_cols if c in categorical_cols]
        # Columns NOT yet discussed — for "explore further" suggestions
        unmentioned_numeric = [c for c in numeric_cols if c not in mentioned_cols]

        # --- Context-aware suggestions based on what was just discussed ---

        # After data cleaning
        if any(w in msg_lower for w in ["clean", "чистити", "очистити", "почисти"]):
            if mentioned_numeric:
                suggestions.append({"text": f"Show distribution of {mentioned_numeric[0]} after cleaning", "category": "analysis"})
            suggestions.append({"text": "Compare original vs cleaned data statistics", "category": "analysis"})

        # After statistics / summary
        elif any(w in msg_lower for w in ["statistic", "mean", "average", "summary", "describe", "статистик", "середн"]):
            if mentioned_numeric:
                col = mentioned_numeric[0]
                suggestions.append({"text": f"Show distribution of {col}", "category": "visualization"})
                if mentioned_categorical:
                    suggestions.append({"text": f"Break down {col} by {mentioned_categorical[0]}", "category": "analysis"})
            if len(mentioned_numeric) >= 2:
                suggestions.append({"text": f"What's the correlation between {mentioned_numeric[0]} and {mentioned_numeric[1]}?", "category": "analysis"})

        # After distribution / histogram
        elif any(w in msg_lower for w in ["distribution", "histogram", "розподіл"]):
            if mentioned_numeric:
                col = mentioned_numeric[0]
                suggestions.append({"text": f"Run normality test on {col}", "category": "analysis"})
                if categorical_cols:
                    suggestions.append({"text": f"Compare {col} distribution across {categorical_cols[0]} groups", "category": "analysis"})

        # After correlation / relationship
        elif any(w in msg_lower for w in ["correlation", "correlat", "relationship", "кореляц", "зв'яз"]):
            if len(mentioned_numeric) >= 2:
                suggestions.append({"text": f"Build regression of {mentioned_numeric[1]} on {mentioned_numeric[0]}", "category": "analysis"})
                suggestions.append({"text": f"Show scatter plot of {mentioned_numeric[0]} vs {mentioned_numeric[1]}", "category": "visualization"})

        # After regression
        elif any(w in msg_lower for w in ["regression", "regres", "predict", "trend"]):
            if mentioned_numeric:
                suggestions.append({"text": f"What are the residuals for {mentioned_numeric[0]}?", "category": "analysis"})
            suggestions.append({"text": "Which variable is the strongest predictor?", "category": "analysis"})

        # After chart / visualization
        elif any(w in msg_lower for w in ["chart", "plot", "graph", "show", "візуаліз", "графік", "покаж"]):
            if mentioned_numeric and categorical_cols:
                suggestions.append({"text": f"Compare {mentioned_numeric[0]} across all {categorical_cols[0]} groups", "category": "analysis"})
            if mentioned_numeric:
                suggestions.append({"text": f"What drives {mentioned_numeric[0]} the most?", "category": "analysis"})

        # After missing values / quality check
        elif any(w in msg_lower for w in ["missing", "пропущен", "missing value", "quality", "якіст"]):
            has_missing = df.isnull().any().any()
            has_duplicates = df.duplicated().any()
            if has_missing or has_duplicates:
                suggestions.append({"text": "Clean the data", "category": "cleaning"})
            if mentioned_numeric:
                suggestions.append({"text": f"Show {mentioned_numeric[0]} statistics excluding missing rows", "category": "analysis"})

        # After outlier analysis
        elif any(w in msg_lower for w in ["outlier", "аномал", "викид"]):
            if mentioned_numeric:
                suggestions.append({"text": f"Remove outliers from {mentioned_numeric[0]} and re-analyze", "category": "cleaning"})
                suggestions.append({"text": f"Show box plot for {mentioned_numeric[0]}", "category": "visualization"})

        # After groupby / comparison
        elif any(w in msg_lower for w in ["by ", "group", "compar", "порівн", "групу"]):
            if mentioned_categorical and mentioned_numeric:
                suggestions.append({"text": f"Is the difference in {mentioned_numeric[0]} across {mentioned_categorical[0]} statistically significant?", "category": "analysis"})
            if mentioned_numeric:
                suggestions.append({"text": f"Show box plot of {mentioned_numeric[0]} by group", "category": "visualization"})

        # --- Fill remaining slots with contextual suggestions ---

        # Suggest exploring unmentioned columns
        if len(suggestions) < 3 and unmentioned_numeric:
            col = unmentioned_numeric[0]
            if mentioned_numeric:
                suggestions.append({"text": f"How does {col} relate to {mentioned_numeric[0]}?", "category": "analysis"})
            else:
                suggestions.append({"text": f"What are the key statistics for {col}?", "category": "analysis"})

        # Suggest cleaning if data has issues and hasn't been cleaned
        if len(suggestions) < 3 and "clean" not in all_text:
            has_missing = df.isnull().any().any()
            has_duplicates = df.duplicated().any()
            if has_missing or has_duplicates:
                parts = []
                if has_missing:
                    parts.append(f"{df.isnull().sum().sum()} missing values")
                if has_duplicates:
                    parts.append(f"{df.duplicated().sum()} duplicates")
                suggestions.append({"text": f"Clean the data ({', '.join(parts)})", "category": "cleaning"})

        # Business-oriented follow-up
        if len(suggestions) < 3 and numeric_cols:
            target = mentioned_numeric[0] if mentioned_numeric else numeric_cols[0]
            suggestions.append({"text": f"What drives {target} the most?", "category": "analysis"})

        return suggestions[:3]

    async def _execute_tool(
        self,
        name: str,
        input: dict,
        df: pd.DataFrame,
        session_id: str,
        session_mgr: Optional["SessionManager"],
        chat_messages: list[str],
        plots: list[PlotInfo],
        user_message: str = "",
    ) -> dict:
        """Execute a tool and return the result."""

        if name == "write_to_chat":
            return await self._handle_write_to_chat(
                input, session_id, session_mgr, chat_messages
            )
        elif name == "generate_query":
            return await self._handle_generate_query(input, df, session_id, session_mgr)
        elif name == "create_plot":
            return await self._handle_create_plot(
                input, df, session_id, session_mgr, plots, user_message
            )
        elif name == "finish":
            return {"content": "Turn completed.", "finished": True}
        else:
            return {"content": f"Unknown tool: {name}", "is_error": True}

    async def _handle_write_to_chat(
        self,
        input: dict,
        session_id: str,
        session_mgr: Optional["SessionManager"],
        chat_messages: list[str],
    ) -> dict:
        """Send text to user."""
        text = input.get("text", "")
        chat_messages.append(text)

        if session_mgr:
            session_mgr.add_chat_message(session_id, "assistant", text)

        return {"content": "Message sent to user."}

    async def _handle_generate_query(
        self,
        input: dict,
        df: pd.DataFrame,
        session_id: str,
        session_mgr: Optional["SessionManager"],
    ) -> dict:
        """Generate and execute a pandas query via QueryMaker.

        The Planner validates results through its tool-use loop - if the result
        doesn't match the intent, it can call generate_query again.
        """
        intent = input.get("intent", "")

        # Try to get cached data summary, generate if not available
        data_summary = None
        if session_mgr:
            data_summary = session_mgr.get_data_summary(session_id, version="current")

        if not data_summary:
            data_summary = self._summarize_for_query(df)
            # Cache the summary for future use
            if session_mgr:
                session_mgr.save_data_summary(session_id, data_summary, version="current")

        # Delegate to QueryMaker
        try:
            generated = await self.query_maker.generate_query(intent, data_summary)
        except ValueError as e:
            safe_print(f"[Planner] Query generation failed: {e}")
            return {
                "content": f"Query generation failed: {e}. Try a simpler or more specific request.",
                "is_error": True,
            }

        # Evaluate code safety before execution
        safety_report = self.metrics.evaluate_code_safety(generated.code)
        if not safety_report.all_passed:
            safe_print(f"[Planner] Code safety FAILED: {safety_report.to_feedback()}")
            return {
                "content": f"Code rejected by safety check.{safety_report.to_feedback()}",
                "is_error": True,
                "metrics": safety_report.to_dict(),
            }

        # Execute code
        result = self.query_executor.execute(generated.code, df)

        # Save query for audit/debug
        if session_mgr:
            session_mgr.add_query(
                session_id=session_id,
                intent=intent,
                code=generated.code,
                success=result.success,
                result_type=result.result_type,
                result_preview=result.result_preview[:500] if result.result_preview else None,
                error=result.error[:500] if result.error else None,
            )

        # Evaluate valid_answer metric
        query_metrics = self.metrics.evaluate_query_result(
            success=result.success,
            result=result.result,
            result_type=result.result_type,
            result_preview=result.result_preview,
            error=result.error,
            intent=intent,
        )

        if result.success:
            response = {
                "content": (
                    f"Query executed successfully.\n"
                    f"Code: {generated.code}\n"
                    f"Explanation: {generated.explanation}\n"
                    f"Result: {result.result_preview}"
                    f"{query_metrics.to_feedback()}"
                ),
                "metrics": query_metrics.to_dict(),
                "result_preview": result.result_preview,
            }

            # If transformation, return new df with detailed change info
            if result.result_type == "dataframe":
                new_df = result.result
                response["new_df"] = new_df

                # Invalidate cached summary since data changed
                if session_mgr:
                    session_mgr.invalidate_data_summary(session_id, version="current")

                # Build detailed data change summary
                old_shape = df.shape
                new_shape = new_df.shape
                old_cols = set(df.columns)
                new_cols = set(new_df.columns)

                added_cols = new_cols - old_cols
                removed_cols = old_cols - new_cols

                change_info = []
                change_info.append(f"Data shape: {old_shape[0]}×{old_shape[1]} → {new_shape[0]}×{new_shape[1]}")

                if removed_cols:
                    change_info.append(f"Removed columns: {', '.join(removed_cols)}")
                if added_cols:
                    change_info.append(f"Added columns: {', '.join(added_cols)}")
                if new_shape[0] != old_shape[0]:
                    change_info.append(f"Rows changed: {old_shape[0]} → {new_shape[0]}")

                change_info.append(f"Current columns: {', '.join(new_df.columns.tolist())}")

                response["content"] += f"\n\nDATA CHANGES:\n" + "\n".join(change_info)

                # Build user-friendly transformation summary
                summary_parts = ["**Data updated**"]
                if removed_cols:
                    summary_parts.append(f"Removed: {', '.join(removed_cols)}")
                if added_cols:
                    summary_parts.append(f"Added: {', '.join(added_cols)}")
                if new_shape[0] != old_shape[0]:
                    diff = new_shape[0] - old_shape[0]
                    if diff > 0:
                        summary_parts.append(f"+{diff} rows")
                    else:
                        summary_parts.append(f"{diff} rows")
                summary_parts.append(f"{new_shape[0]} rows x {new_shape[1]} columns")
                response["transformation_summary"] = " | ".join(summary_parts)

            return response
        else:
            return {
                "content": f"Query failed: {result.error}{query_metrics.to_feedback()}",
                "is_error": True,
                "metrics": query_metrics.to_dict(),
            }

    async def _handle_create_plot(
        self,
        input: dict,
        df: pd.DataFrame,
        session_id: str,
        session_mgr: Optional["SessionManager"],
        plots: list[PlotInfo],
        user_message: str = "",
    ) -> dict:
        """Create a plot by preparing chart data for frontend rendering."""
        from backend.models.planner_models import ChartConfig

        safe_print(f"[Planner] _handle_create_plot called with input: {input}")
        safe_print(f"[Planner] DataFrame shape: {df.shape}, columns: {list(df.columns)}")

        plot_type = input.get("plot_type", "bar")
        title = input.get("title", "Plot")
        x_column = input.get("x_column")
        y_column = input.get("y_column")
        color_column = input.get("color_column")
        aggregation = input.get("aggregation")  # None → smart inference in _prepare_chart_data
        bins = input.get("bins")

        try:
            # Auto-detect columns if not provided
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            categorical_cols = df.select_dtypes(exclude=['number']).columns.tolist()

            if not x_column:
                x_column = categorical_cols[0] if categorical_cols else df.columns[0]
            if not y_column:
                y_column = numeric_cols[0] if numeric_cols else df.columns[1] if len(df.columns) > 1 else df.columns[0]

            instructions = input.get("instructions")
            # Fallback: use title then user_message as instructions hint
            if not instructions and title:
                instructions = title
            if not instructions and user_message:
                instructions = user_message

            # Prepare chart data based on plot type
            safe_print(f"[Planner] Preparing chart data: type={plot_type}, x={x_column}, y={y_column}, agg={aggregation}")
            chart_data = self._prepare_chart_data(
                df=df,
                plot_type=plot_type,
                x_column=x_column,
                y_column=y_column,
                color_column=color_column,
                aggregation=aggregation,
                instructions=instructions,
                bins=bins,
            )
            safe_print(f"[Planner] chart_data result: {len(chart_data) if chart_data else 0} data points")

            if not chart_data:
                print("[Planner] ERROR: No chart data generated!")
                return {
                    "content": "Failed to prepare chart data: no data points generated",
                    "is_error": True
                }

            # Extract series names for multi-series charts (pivoted data)
            series = None
            if color_column and chart_data and plot_type in ("bar", "line", "area"):
                first_row_keys = list(chart_data[0].keys())
                candidate = [k for k in first_row_keys if k != x_column]
                if len(candidate) > 1:  # Multiple series present
                    series = candidate

            # Create chart config (box/heatmap use special keys)
            if plot_type == "heatmap":
                chart_config = ChartConfig(chart_type="heatmap", x_key="x", y_key="y", color_key=None)
            elif plot_type == "box":
                chart_config = ChartConfig(chart_type="box", x_key="name", y_key="value", color_key=color_column)
            else:
                chart_config = ChartConfig(chart_type=plot_type, x_key=x_column, y_key=y_column, color_key=color_column, series=series)

            # Create plot info
            plot_id = str(uuid.uuid4())[:8]
            columns_used = [x_column, y_column]
            if color_column:
                columns_used.append(color_column)

            # Generate summary
            summary = self._generate_chart_summary(df, x_column, y_column, aggregation)

            # Generate Python code snippet
            code_snippet = self._generate_code_snippet(
                plot_type=plot_type,
                title=title,
                x_column=x_column,
                y_column=y_column,
                color_column=color_column,
                aggregation=aggregation,
                instructions=instructions,
            )

            plot_info = PlotInfo(
                id=plot_id,
                title=title,
                columns_used=", ".join(columns_used),
                summary=summary,
                chart_config=chart_config,
                chart_data=chart_data,
                code_snippet=code_snippet,
            )
            plots.append(plot_info)

            # Persist to session
            if session_mgr:
                session_mgr.add_plot(session_id, plot_info.model_dump())
                try:
                    session_mgr.add_chat_message(
                        session_id=session_id,
                        role="system",
                        text=title,
                        message_type="plot",
                        plot_title=title,
                        plot_data={
                            "chart_config": chart_config.model_dump(),
                            "chart_data": chart_data,
                        },
                    )
                except Exception as e:
                    import traceback
                    safe_print(f"[Planner] Failed to save plot chat message: {e}")
                    traceback.print_exc()

            safe_print(f"[Planner] Plot created successfully: {title}, {len(chart_data)} points")
            return {
                "content": (
                    f"Plot created: {title}\n"
                    f"Type: {plot_type}\n"
                    f"Columns: {', '.join(columns_used)}\n"
                    f"Data points: {len(chart_data)}"
                ),
                "plot_info": plot_info,
            }

        except Exception as e:
            import traceback
            safe_print(f"[Planner] Plot creation EXCEPTION: {e}")
            traceback.print_exc()
            return {
                "content": f"Plot creation error: {str(e)}\n{traceback.format_exc()}",
                "is_error": True
            }

    @staticmethod
    def _safe_float(val) -> float:
        """Convert value to a JSON-safe float (replace NaN/inf with 0)."""
        import math
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return f

    def _prepare_chart_data(
        self,
        df: pd.DataFrame,
        plot_type: str,
        x_column: str,
        y_column: str,
        color_column: Optional[str],
        aggregation: Optional[str] = None,
        instructions: Optional[str] = None,
        bins: Optional[int] = None,
    ) -> list[dict]:
        """Prepare chart data by running DuckDB SQL aggregations."""
        import duckdb
        import numpy as np

        safe_print(f"[Planner] _prepare_chart_data: plot_type={plot_type}, x={x_column}, y={y_column}, agg={aggregation}")
        safe_print(f"[Planner] DataFrame columns: {list(df.columns)}")
        safe_print(f"[Planner] instructions: {instructions}")

        def q(col: str) -> str:
            """Quote a column name for SQL."""
            return f'"{col}"'

        try:
            conn = duckdb.connect()
            conn.register('df', df)

            if plot_type == "histogram":
                if pd.api.types.is_numeric_dtype(df[x_column]):
                    # Use numpy for histogram binning (cleaner than SQL bins)
                    col_data = df[x_column].dropna()
                    if len(col_data) == 0:
                        return []

                    # Use explicit bins param, or parse from instructions
                    import re as _re
                    n_bins = bins or 20
                    if not bins and instructions:
                        bin_match = _re.search(r'bin(?:ned|s|_size)?\s*(?:by|of|=|:)?\s*([\d.]+)', instructions, _re.IGNORECASE)
                        if bin_match:
                            bin_size = float(bin_match.group(1))
                            if bin_size > 0:
                                data_range = col_data.max() - col_data.min()
                                n_bins = max(1, int(np.ceil(data_range / bin_size)))

                    counts, bin_edges = np.histogram(col_data, bins=n_bins)

                    # Auto-detect decimal precision from bin width
                    bin_width = bin_edges[1] - bin_edges[0] if len(bin_edges) > 1 else 1
                    if bin_width >= 1:
                        precision = 0
                    elif bin_width >= 0.1:
                        precision = 1
                    elif bin_width >= 0.01:
                        precision = 2
                    else:
                        precision = 3

                    return [
                        {x_column: f"{bin_edges[i]:.{precision}f}-{bin_edges[i+1]:.{precision}f}", "count": int(counts[i])}
                        for i in range(len(counts))
                    ]
                else:
                    sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, COUNT(*) AS count FROM df GROUP BY {q(x_column)} ORDER BY count DESC LIMIT 20"
                    result = conn.execute(sql).fetchdf()
                    return result.to_dict('records')

            elif plot_type == "pie":
                if pd.api.types.is_numeric_dtype(df[y_column]):
                    agg = aggregation or "sum"
                    sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, {agg}({q(y_column)}) AS {q(y_column)} FROM df GROUP BY {q(x_column)} LIMIT 10"
                    result = conn.execute(sql).fetchdf()
                    records = []
                    for _, row in result.iterrows():
                        records.append({x_column: str(row[x_column]), y_column: self._safe_float(row[y_column])})
                    return records
                else:
                    sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, COUNT(*) AS count FROM df GROUP BY {q(x_column)} ORDER BY count DESC LIMIT 10"
                    result = conn.execute(sql).fetchdf()
                    return result.to_dict('records')

            elif plot_type == "box":
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()

                if x_column in df.columns and not pd.api.types.is_numeric_dtype(df[x_column]) and y_column in df.columns and pd.api.types.is_numeric_dtype(df[y_column]):
                    # Grouped box plot via SQL
                    sql = f"""
                        SELECT
                            CAST({q(x_column)} AS VARCHAR) AS name,
                            ROUND(MIN({q(y_column)})::DOUBLE, 2) AS min,
                            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {q(y_column)})::DOUBLE, 2) AS q1,
                            ROUND(MEDIAN({q(y_column)})::DOUBLE, 2) AS median,
                            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {q(y_column)})::DOUBLE, 2) AS q3,
                            ROUND(MAX({q(y_column)})::DOUBLE, 2) AS max
                        FROM df
                        WHERE {q(y_column)} IS NOT NULL
                        GROUP BY {q(x_column)}
                        LIMIT 20
                    """
                    result = conn.execute(sql).fetchdf()
                    return result.to_dict('records')
                else:
                    box_data = []
                    for col in numeric_cols[:15]:
                        sql = f"""
                            SELECT
                                ROUND(MIN({q(col)})::DOUBLE, 2) AS min,
                                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {q(col)})::DOUBLE, 2) AS q1,
                                ROUND(MEDIAN({q(col)})::DOUBLE, 2) AS median,
                                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {q(col)})::DOUBLE, 2) AS q3,
                                ROUND(MAX({q(col)})::DOUBLE, 2) AS max
                            FROM df
                            WHERE {q(col)} IS NOT NULL
                        """
                        row = conn.execute(sql).fetchdf().iloc[0]
                        box_data.append({"name": col, **row.to_dict()})
                    return box_data

            elif plot_type == "heatmap":
                # Correlation matrix for all numeric columns
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()[:15]
                if len(numeric_cols) < 2:
                    return []
                corr_matrix = df[numeric_cols].corr()
                chart_data = []
                for col1 in corr_matrix.columns:
                    for col2 in corr_matrix.index:
                        val = corr_matrix.loc[col2, col1]
                        chart_data.append({
                            "x": col1,
                            "y": col2,
                            "value": round(float(val), 3) if not pd.isna(val) else 0,
                        })
                return chart_data

            elif plot_type == "scatter":
                sql = f"SELECT {q(x_column)}, {q(y_column)} FROM df WHERE {q(x_column)} IS NOT NULL AND {q(y_column)} IS NOT NULL LIMIT 500"
                result = conn.execute(sql).fetchdf()
                records = []
                x_is_num = pd.api.types.is_numeric_dtype(df[x_column])
                y_is_num = pd.api.types.is_numeric_dtype(df[y_column])
                for _, row in result.iterrows():
                    records.append({
                        x_column: self._safe_float(row[x_column]) if x_is_num else str(row[x_column]),
                        y_column: self._safe_float(row[y_column]) if y_is_num else str(row[y_column]),
                    })
                return records

            else:
                # Bar, line, area - aggregate data
                import re as _re

                # Smart aggregation inference
                if aggregation:
                    agg = aggregation
                elif x_column == y_column:
                    agg = "count"
                elif not pd.api.types.is_numeric_dtype(df[y_column]):
                    agg = "count"
                else:
                    agg = "mean"

                if pd.api.types.is_numeric_dtype(df[y_column]):
                    x_is_unique = df[x_column].nunique() == len(df)

                    # Auto-detect time/date column for ascending sort
                    is_time_col = bool(_re.search(
                        r'(year|date|month|week|time|quarter|period|day)',
                        x_column, _re.IGNORECASE
                    )) or pd.api.types.is_datetime64_any_dtype(df[x_column])

                    if color_column and color_column != x_column:
                        sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, CAST({q(color_column)} AS VARCHAR) AS {q(color_column)}, {agg}({q(y_column)}) AS {q(y_column)} FROM df GROUP BY {q(x_column)}, {q(color_column)} LIMIT 200"
                        result = conn.execute(sql).fetchdf()

                        # Pivot for Recharts: flat → {x: "val", series1: num, series2: num}
                        if not result.empty:
                            pivot = result.pivot_table(
                                index=x_column, columns=color_column,
                                values=y_column, fill_value=0
                            ).reset_index()
                            # Sort: time columns ascending
                            if is_time_col:
                                try:
                                    pivot = pivot.sort_values(
                                        x_column,
                                        key=lambda s: pd.to_numeric(s, errors='coerce')
                                    )
                                except Exception:
                                    pivot = pivot.sort_values(x_column)
                            records = []
                            for _, row in pivot.iterrows():
                                point = {x_column: str(row[x_column])}
                                for col in pivot.columns:
                                    if col != x_column:
                                        point[str(col)] = self._safe_float(row[col])
                                records.append(point)
                            return records
                        return []

                    elif x_is_unique:
                        sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, {q(y_column)} FROM df WHERE {q(y_column)} IS NOT NULL"
                        if is_time_col:
                            sql += f" ORDER BY {q(x_column)} ASC"
                        sql += " LIMIT 50"
                    else:
                        sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, {agg}({q(y_column)}) AS {q(y_column)} FROM df GROUP BY {q(x_column)}"

                        # Apply instructions or auto-sort
                        order_clause, limit_val = self._instructions_to_sql(y_column, instructions)
                        if order_clause:
                            sql += order_clause
                        elif is_time_col:
                            sql += f" ORDER BY {q(x_column)} ASC"
                        elif plot_type == "bar":
                            sql += f' ORDER BY {q(y_column)} DESC'
                        sql += f" LIMIT {limit_val}"

                    result = conn.execute(sql).fetchdf()

                    records = []
                    for _, row in result.iterrows():
                        point = {x_column: str(row[x_column]), y_column: self._safe_float(row[y_column])}
                        records.append(point)
                    return records
                else:
                    sql = f"SELECT CAST({q(x_column)} AS VARCHAR) AS {q(x_column)}, COUNT(*) AS count FROM df GROUP BY {q(x_column)} ORDER BY count DESC LIMIT 30"
                    result = conn.execute(sql).fetchdf()
                    return result.to_dict('records')

        except Exception as e:
            import traceback
            safe_print(f"[Planner] Error preparing chart data: {e}")
            traceback.print_exc()
            return []
        finally:
            if conn:
                conn.close()

    def _instructions_to_sql(self, y_column: str, instructions: Optional[str]) -> tuple[str, int]:
        """Convert chart instructions (sort, top N) to SQL ORDER BY / LIMIT clauses."""
        import re as _re
        if not instructions:
            return "", 50

        instr = instructions.lower()
        order = ""
        limit = 50

        # Top N
        top_match = _re.search(r'top\s*(\d+)', instr)
        if top_match:
            limit = int(top_match.group(1))
            order = f' ORDER BY "{y_column}" DESC'
            return order, limit

        # Bottom N
        bottom_match = _re.search(r'bottom\s*(\d+)', instr)
        if bottom_match:
            limit = int(bottom_match.group(1))
            order = f' ORDER BY "{y_column}" ASC'
            return order, limit

        # Sort
        if 'sort' in instr or 'descend' in instr or 'ascend' in instr:
            direction = 'ASC' if ('ascend' in instr and 'descend' not in instr) else 'DESC'
            order = f' ORDER BY "{y_column}" {direction}'

        return order, limit

    def _generate_chart_summary(
        self,
        df: pd.DataFrame,
        x_column: str,
        y_column: str,
        aggregation: str,
    ) -> str:
        """Generate a brief summary for the chart."""
        try:
            if pd.api.types.is_numeric_dtype(df[y_column]):
                total = df[y_column].sum()
                mean = df[y_column].mean()
                return f"Total: {total:,.2f}, Average: {mean:,.2f}"
            else:
                unique_count = df[x_column].nunique()
                return f"{unique_count} unique values in {x_column}"
        except Exception:
            return ""

    def _generate_code_snippet(
        self,
        plot_type: str,
        title: str,
        x_column: str,
        y_column: str,
        color_column: Optional[str],
        aggregation: str,
        instructions: Optional[str] = None,
    ) -> str:
        """Generate a self-contained Python/matplotlib code snippet to recreate the chart."""
        lines = [
            "import pandas as pd",
            "import matplotlib.pyplot as plt",
            "",
            "# Load your data",
            "df = pd.read_csv('your_data.csv')",
            "",
        ]

        agg = aggregation or "sum"
        safe_title = title.replace("'", "\\'")
        safe_x = x_column.replace("'", "\\'")
        safe_y = y_column.replace("'", "\\'")

        if plot_type == "heatmap":
            lines.insert(1, "import seaborn as sns")
            lines.append(f"fig, ax = plt.subplots(figsize=(10, 8))")
            lines.append(f"corr = df.select_dtypes(include='number').corr()")
            lines.append(f"sns.heatmap(corr, annot=True, fmt='.2f', cmap='RdBu_r', center=0, vmin=-1, vmax=1,")
            lines.append(f"           square=True, linewidths=0.5, ax=ax)")

        elif plot_type == "histogram":
            lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
            lines.append(f"ax.hist(df['{safe_x}'].dropna(), bins=20, color='#9333ea', edgecolor='white', alpha=0.85)")
            lines.append(f"ax.set_xlabel('{safe_x}')")
            lines.append(f"ax.set_ylabel('Count')")

        elif plot_type == "pie":
            lines.append(f"data = df.groupby('{safe_x}')['{safe_y}'].{agg}().head(10)")
            lines.append(f"fig, ax = plt.subplots(figsize=(8, 8))")
            lines.append(f"ax.pie(data.values, labels=data.index, autopct='%1.1f%%', startangle=90)")

        elif plot_type == "box":
            if color_column:
                lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
                lines.append(f"df.boxplot(column='{safe_y}', by='{safe_x}', ax=ax)")
                lines.append(f"plt.suptitle('')")
            else:
                lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
                lines.append(f"df.boxplot(column='{safe_y}', ax=ax)")

        elif plot_type == "scatter":
            lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
            lines.append(f"ax.scatter(df['{safe_x}'], df['{safe_y}'], alpha=0.6, color='#9333ea', edgecolors='white', linewidth=0.5)")
            lines.append(f"ax.set_xlabel('{safe_x}')")
            lines.append(f"ax.set_ylabel('{safe_y}')")

        elif plot_type == "line":
            lines.append(f"data = df.groupby('{safe_x}')['{safe_y}'].{agg}().reset_index()")
            if instructions:
                lines.append(f"# Instructions: {instructions}")
            lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
            if color_column:
                safe_color = color_column.replace("'", "\\'")
                lines.append(f"for group, grp_df in df.groupby('{safe_color}'):")
                lines.append(f"    grp = grp_df.groupby('{safe_x}')['{safe_y}'].{agg}().reset_index()")
                lines.append(f"    ax.plot(grp['{safe_x}'], grp['{safe_y}'], marker='o', markersize=3, label=group)")
                lines.append(f"ax.legend()")
            else:
                lines.append(f"ax.plot(data['{safe_x}'], data['{safe_y}'], marker='o', markersize=3, color='#9333ea')")
            lines.append(f"ax.set_xlabel('{safe_x}')")
            lines.append(f"ax.set_ylabel('{safe_y}')")
            lines.append(f"plt.xticks(rotation=45, ha='right')")

        else:  # bar (default)
            lines.append(f"data = df.groupby('{safe_x}')['{safe_y}'].{agg}().reset_index()")
            if instructions:
                lines.append(f"# Instructions: {instructions}")
                import re
                top_match = re.search(r'top\s*(\d+)', instructions.lower()) if instructions else None
                if top_match:
                    n = top_match.group(1)
                    lines.append(f"data = data.nlargest({n}, '{safe_y}')")
                if instructions and ('descend' in instructions.lower() or 'sort' in instructions.lower()):
                    lines.append(f"data = data.sort_values('{safe_y}', ascending=False)")
            lines.append(f"fig, ax = plt.subplots(figsize=(10, 6))")
            if color_column:
                safe_color = color_column.replace("'", "\\'")
                lines.append(f"# Grouped bar chart by {safe_color}")
                lines.append(f"pivot = df.groupby(['{safe_x}', '{safe_color}'])['{safe_y}'].{agg}().unstack(fill_value=0)")
                lines.append(f"pivot.plot(kind='bar', ax=ax)")
                lines.append(f"ax.legend(title='{safe_color}')")
            else:
                lines.append(f"ax.bar(data['{safe_x}'], data['{safe_y}'], color='#9333ea', edgecolor='white', linewidth=0.5)")
            lines.append(f"ax.set_xlabel('{safe_x}')")
            lines.append(f"ax.set_ylabel('{safe_y} ({agg})')")
            lines.append(f"plt.xticks(rotation=45, ha='right')")

        lines.append(f"ax.set_title('{safe_title}')")
        lines.append(f"plt.tight_layout()")
        lines.append(f"plt.savefig('{plot_type}_chart.png', dpi=150, bbox_inches='tight')")
        lines.append(f"plt.show()")

        return "\n".join(lines)
