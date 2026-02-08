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
from backend.models.planner_models import ChatEvent, ToolCall, PlotInfo

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
    ):
        self.llm = llm
        self.query_maker = query_maker
        self.query_executor = query_executor
        self.metrics = metrics_evaluator or get_metrics_evaluator()
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

    def _summarize_for_query(self, df: pd.DataFrame) -> str:
        """
        Generate a minimal summary optimized for query generation.
        Very token-efficient - just what's needed to write pandas code.
        """
        lines = []

        lines.append("DataFrame info:")
        lines.append(f"- Shape: {df.shape[0]} rows x {df.shape[1]} columns")
        lines.append("")
        lines.append("Columns:")

        for col in df.columns:
            dtype = str(df[col].dtype)

            # Add range/categories for better query context
            if pd.api.types.is_numeric_dtype(df[col]):
                min_val = df[col].min()
                max_val = df[col].max()
                lines.append(f"  - {col} ({dtype}): range [{min_val} to {max_val}]")
            elif pd.api.types.is_categorical_dtype(df[col]) or df[col].nunique() <= 10:
                categories = df[col].dropna().unique().tolist()[:10]
                lines.append(f"  - {col} ({dtype}): categories {categories}")
            else:
                sample = str(df[col].dropna().iloc[0])[:30] if len(df[col].dropna()) > 0 else "N/A"
                lines.append(f"  - {col} ({dtype}): e.g. \"{sample}\"")

        return "\n".join(lines)

    async def run(
        self,
        user_message: str,
        df: pd.DataFrame,
        filename: str,
        session_id: str,
        session_mgr: Optional["SessionManager"] = None,
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

        # State for this run
        current_df = df.copy()
        chat_messages: list[str] = []
        plots: list[PlotInfo] = []
        finished = False
        data_updated = False
        last_query_result_preview: Optional[str] = None  # For hallucination checks
        run_metrics: list[dict] = []  # Collect all metrics reports for this run

        # Build initial context
        data_context = self._build_data_context(current_df, filename)

        # Get existing plots for dedup
        existing_plots_info = ""
        if session_mgr:
            existing_plots = session_mgr.get_plots(session_id)
            if existing_plots:
                titles = [p.get("title", "Untitled") for p in existing_plots]
                existing_plots_info = f"\n\nEXISTING PLOTS (already created — do NOT recreate these. If user asks for a similar plot, tell them it already exists instead of creating a duplicate):\n" + "\n".join(f"- {t}" for t in titles)

        # Initialize messages
        messages = [{
            "role": "user",
            "content": f"""DATA CONTEXT:
{data_context}{existing_plots_info}

USER REQUEST:
{user_message}

Use the available tools to fulfill this request. Always call finish() when done."""
        }]

        iteration = 0

        while iteration < self.MAX_ITERATIONS and not finished:
            iteration += 1

            # Emit status update
            if iteration == 1:
                yield ChatEvent(event_type="status", data={"message": "Analyzing request..."})
            else:
                yield ChatEvent(event_type="status", data={"message": "Planning next step..."})

            # Call LLM with tools
            try:
                safe_print(f"[Planner] Iteration {iteration}: calling LLM...", flush=True)
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
                            chat_messages.append(block.text)
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
                        chat_messages=chat_messages,
                        plots=plots,
                    )

                    # Update state based on result
                    if result.get("new_df") is not None:
                        current_df = result["new_df"]
                        data_updated = True
                        # Persist transformed dataframe to session
                        if session_mgr:
                            session_mgr.save_transformed_dataframe(session_id, current_df)

                    if result.get("finished"):
                        finished = True

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_call.id,
                        "content": result["content"],
                        "is_error": result.get("is_error", False)
                    })

                    # Collect metrics from tool result
                    if result.get("metrics"):
                        run_metrics.append(result["metrics"])

                    # Track last query result for hallucination checks
                    if tool_call.name == "generate_query" and result.get("result_preview"):
                        last_query_result_preview = result["result_preview"]

                    # Yield events based on tool type
                    if tool_call.name == "write_to_chat":
                        chat_text = tool_call.input.get("text", "")
                        # Hallucination check: log only, don't feed back to LLM
                        # (feeding FAIL back causes LLM to duplicate messages)
                        if last_query_result_preview and chat_text:
                            hall_report = self.metrics.evaluate_chat_text(
                                chat_text, last_query_result_preview
                            )
                            run_metrics.append(hall_report.to_dict())
                            if not hall_report.all_passed:
                                safe_print(f"[Planner] Hallucination check (info only): {hall_report.to_feedback()}")

                        yield ChatEvent(
                            event_type="text",
                            data={"text": chat_text}
                        )
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
                        chat_messages.append(block.text)
                        # Save to chat history
                        if session_mgr:
                            session_mgr.add_chat_message(session_id, "assistant", block.text)
                break

        # Safety net: if the agent finished without sending any text or plots to the user,
        # send a fallback message so the user always gets a response
        if not chat_messages and not plots:
            safe_print(f"[Planner] WARNING: Agent finished without any user-visible output! Sending fallback.")
            fallback_text = "I wasn't able to produce a response for that request. Could you try rephrasing your question?"
            yield ChatEvent(event_type="text", data={"text": fallback_text})
            if session_mgr:
                session_mgr.add_chat_message(session_id, "assistant", fallback_text)

        # Generate follow-up suggestions
        followup_suggestions = self._generate_followup_suggestions(
            current_df, chat_messages, plots, user_message
        )

        # Yield done event with metrics summary
        yield ChatEvent(
            event_type="done",
            data={
                "iterations": iteration,
                "messages_sent": len(chat_messages),
                "plots_created": len(plots),
                "data_updated": data_updated,
                "new_df": current_df if data_updated else None,
                "metrics": run_metrics,
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
        """Generate follow-up suggestion chips based on conversation context."""
        suggestions = []
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        categorical_cols = [
            c for c in df.select_dtypes(exclude=['number']).columns
            if df[c].nunique() <= 20
        ]

        # Check what was discussed to suggest relevant follow-ups
        msg_lower = user_message.lower()
        all_text = " ".join(chat_messages).lower()

        # Check for data quality issues
        has_missing = df.isnull().any().any()
        has_duplicates = df.duplicated().any()

        # After initial analysis, suggest data cleaning if needed
        if (has_missing or has_duplicates) and "clean" not in msg_lower:
            parts = []
            if has_missing:
                parts.append(f"{df.isnull().sum().sum()} missing values")
            if has_duplicates:
                parts.append(f"{df.duplicated().sum()} duplicates")
            suggestions.append({
                "text": f"Clean the data ({', '.join(parts)})",
                "category": "cleaning",
            })

        # If plots were created, suggest deeper analysis
        if plots:
            if numeric_cols and len(numeric_cols) >= 2:
                suggestions.append({
                    "text": f"Show correlation between {numeric_cols[0]} and {numeric_cols[1]}",
                    "category": "analysis",
                })

        # If statistics were discussed, suggest visualizations
        if any(w in msg_lower for w in ["statistic", "mean", "average", "summary", "describe"]):
            if numeric_cols:
                suggestions.append({
                    "text": f"Show box plot for {numeric_cols[0]}",
                    "category": "visualization",
                })

        # If distribution was discussed, suggest tests
        if any(w in msg_lower for w in ["distribution", "histogram", "розподіл"]):
            if numeric_cols:
                suggestions.append({
                    "text": f"Run normality test on {numeric_cols[0]}",
                    "category": "analysis",
                })

        # If regression was discussed, suggest prediction
        if any(w in msg_lower for w in ["regression", "regres", "predict", "trend"]):
            suggestions.append({
                "text": "Show scatter plot with trend line",
                "category": "visualization",
            })

        # General suggestions based on data
        if len(suggestions) < 3 and numeric_cols and categorical_cols:
            suggestions.append({
                "text": f"Compare {numeric_cols[0]} across {categorical_cols[0]} groups",
                "category": "analysis",
            })

        if len(suggestions) < 3 and len(numeric_cols) >= 2:
            suggestions.append({
                "text": f"Build regression of {numeric_cols[1]} on {numeric_cols[0]}",
                "category": "analysis",
            })

        if len(suggestions) < 3:
            suggestions.append({
                "text": "Are there any outliers in the data?",
                "category": "analysis",
            })

        if len(suggestions) < 3 and "missing" not in all_text:
            suggestions.append({
                "text": "Check for missing values",
                "category": "analysis",
            })

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
                input, df, session_id, session_mgr, plots
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
        generated = await self.query_maker.generate_query(intent, data_summary)

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
        aggregation = input.get("aggregation", "sum")

        try:
            # Auto-detect columns if not provided
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
            categorical_cols = df.select_dtypes(exclude=['number']).columns.tolist()

            if not x_column:
                x_column = categorical_cols[0] if categorical_cols else df.columns[0]
            if not y_column:
                y_column = numeric_cols[0] if numeric_cols else df.columns[1] if len(df.columns) > 1 else df.columns[0]

            # Prepare chart data based on plot type
            safe_print(f"[Planner] Preparing chart data: type={plot_type}, x={x_column}, y={y_column}")
            chart_data = self._prepare_chart_data(
                df=df,
                plot_type=plot_type,
                x_column=x_column,
                y_column=y_column,
                color_column=color_column,
                aggregation=aggregation,
            )
            safe_print(f"[Planner] chart_data result: {len(chart_data) if chart_data else 0} data points")

            if not chart_data:
                print("[Planner] ERROR: No chart data generated!")
                return {
                    "content": "Failed to prepare chart data: no data points generated",
                    "is_error": True
                }

            # Create chart config (box plots use special keys)
            chart_config = ChartConfig(
                chart_type=plot_type,
                x_key="name" if plot_type == "box" else x_column,
                y_key="value" if plot_type == "box" else y_column,
                color_key=color_column,
            )

            # Create plot info
            plot_id = str(uuid.uuid4())[:8]
            columns_used = [x_column, y_column]
            if color_column:
                columns_used.append(color_column)

            # Generate summary
            summary = self._generate_chart_summary(df, x_column, y_column, aggregation)

            plot_info = PlotInfo(
                id=plot_id,
                title=title,
                columns_used=", ".join(columns_used),
                summary=summary,
                chart_config=chart_config,
                chart_data=chart_data,
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

    def _prepare_chart_data(
        self,
        df: pd.DataFrame,
        plot_type: str,
        x_column: str,
        y_column: str,
        color_column: Optional[str],
        aggregation: str,
    ) -> list[dict]:
        """Prepare chart data by aggregating DataFrame."""
        import numpy as np

        safe_print(f"[Planner] _prepare_chart_data: plot_type={plot_type}, x={x_column}, y={y_column}")
        safe_print(f"[Planner] DataFrame columns: {list(df.columns)}")
        safe_print(f"[Planner] x_column in df: {x_column in df.columns if x_column else 'N/A'}")
        safe_print(f"[Planner] y_column in df: {y_column in df.columns if y_column else 'N/A'}")

        try:
            # Handle different plot types
            if plot_type == "histogram":
                # For histogram, bin the data
                if pd.api.types.is_numeric_dtype(df[x_column]):
                    counts, bin_edges = np.histogram(df[x_column].dropna(), bins=20)
                    return [
                        {x_column: f"{bin_edges[i]:.1f}-{bin_edges[i+1]:.1f}", "count": int(counts[i])}
                        for i in range(len(counts))
                    ]
                else:
                    # Categorical histogram = value counts
                    value_counts = df[x_column].value_counts().head(20)
                    return [
                        {x_column: str(idx), "count": int(val)}
                        for idx, val in value_counts.items()
                    ]

            elif plot_type == "pie":
                # For pie, aggregate by x_column
                if pd.api.types.is_numeric_dtype(df[y_column]):
                    agg_func = self._get_agg_func(aggregation)
                    grouped = df.groupby(x_column)[y_column].agg(agg_func).head(10)
                    return [
                        {x_column: str(idx), y_column: float(val)}
                        for idx, val in grouped.items()
                    ]
                else:
                    # Use value counts
                    value_counts = df[x_column].value_counts().head(10)
                    return [
                        {x_column: str(idx), "count": int(val)}
                        for idx, val in value_counts.items()
                    ]

            elif plot_type == "box":
                # Box plot: compute 5-number summary (min, Q1, median, Q3, max)
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                categorical_cols = df.select_dtypes(exclude=['number']).columns.tolist()

                if x_column in df.columns and not pd.api.types.is_numeric_dtype(df[x_column]) and y_column in df.columns and pd.api.types.is_numeric_dtype(df[y_column]):
                    # Grouped box plot: y_column grouped by x_column
                    box_data = []
                    for group in df[x_column].dropna().unique()[:20]:
                        col_data = df[df[x_column] == group][y_column].dropna()
                        if len(col_data) > 0:
                            box_data.append({
                                "name": str(group),
                                "min": round(float(col_data.min()), 2),
                                "q1": round(float(col_data.quantile(0.25)), 2),
                                "median": round(float(col_data.quantile(0.5)), 2),
                                "q3": round(float(col_data.quantile(0.75)), 2),
                                "max": round(float(col_data.max()), 2),
                            })
                    return box_data
                else:
                    # Box plot for each numeric column
                    box_data = []
                    for col in numeric_cols[:15]:
                        col_data = df[col].dropna()
                        if len(col_data) > 0:
                            box_data.append({
                                "name": col,
                                "min": round(float(col_data.min()), 2),
                                "q1": round(float(col_data.quantile(0.25)), 2),
                                "median": round(float(col_data.quantile(0.5)), 2),
                                "q3": round(float(col_data.quantile(0.75)), 2),
                                "max": round(float(col_data.max()), 2),
                            })
                    return box_data

            elif plot_type == "scatter":
                # For scatter, return raw data points (limited)
                sample = df[[x_column, y_column]].dropna().head(500)
                return sample.to_dict('records')

            else:
                # Bar, line, area - aggregate data
                if pd.api.types.is_numeric_dtype(df[y_column]):
                    agg_func = self._get_agg_func(aggregation)

                    if color_column and color_column != x_column:
                        # Grouped aggregation
                        grouped = df.groupby([x_column, color_column])[y_column].agg(agg_func).reset_index()
                        grouped = grouped.head(100)  # Limit data points
                    else:
                        grouped = df.groupby(x_column)[y_column].agg(agg_func).reset_index()
                        grouped = grouped.head(50)  # Limit data points

                    # Convert to JSON-serializable format
                    result = []
                    for _, row in grouped.iterrows():
                        point = {x_column: str(row[x_column]), y_column: float(row[y_column])}
                        if color_column:
                            point[color_column] = str(row[color_column])
                        result.append(point)
                    return result
                else:
                    # Count-based chart
                    value_counts = df[x_column].value_counts().head(30)
                    return [
                        {x_column: str(idx), "count": int(val)}
                        for idx, val in value_counts.items()
                    ]

        except Exception as e:
            safe_print(f"[Planner] Error preparing chart data: {e}")
            return []

    def _get_agg_func(self, aggregation: str):
        """Get pandas aggregation function."""
        agg_map = {
            "sum": "sum",
            "mean": "mean",
            "count": "count",
            "min": "min",
            "max": "max",
            "median": "median",
        }
        return agg_map.get(aggregation, "sum")

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
