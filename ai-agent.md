This document details how the ai agent for data analysis in this project should look.

There are two separate flows:
1. Initial analysis (SYSTEM PROMPT 1) - after user initially uploads data
2. Further analysis (SYSTEM PROMPT 2) - after user's first message

Both of the flows lead to the same agent with same tools - let's call him Planner agent. The only difference is its system prompt.

The user flow is the following:

User uploads data.

Planner does initial analysis, defined in Prompt 1. The tools available will be discussed later.

User asks a question.

Planner uses its tools, answers a question.

User asks a question... 

etc...


The LangGraph Architecture. 
The incoming request will come as either initial request, or a question, depending on that we go into the planner node in two different ways (with either prompt 1 or prompt 2).

From this node, Planner Agent decides where to go next. 
Options:
1. Use SQL tool to run a query on the data. (Input: query; Output: data returned from the query, probably trimmed to first N rows). (Only lookup, no insert/modifications just yet)
2. Output a plot in Vega Lite format
3. Output a table in some format 
4. Output text
5. Finalize

Each of the tools loops back to the agent. SQL tool call should be visible to user - on click, user should see query and trimmed returned data. Preferrably, it should be accompanied with a short description (seen without a click) to know what's going on.

Agent needs to have reasoning steps - before each tool call agent needs to output its rationale for a decision. This rationale should be saved as a message in db, but not should to user. It should be included in the model context throughout all the conversation

The context during the whole chat should remain. So user can reference any chat's and user's message.

At all points in time, agent should have in context all the nuances discovered during the previous analyses. To accomplish that, all the reasoning steps are held in context.


System prompt 1.
During the initial analysis the agent should perform all the necessary analysis and output two things:
1. A message - a summary of what the data is about and key insights. It should be concise.
2. A table of per-feature(per-column) analysis. With description of the column, typical values and data quality issues. BTW, all tables (5+ rows) should be shown like a preview and an expand button to expand.

System prompt 2.
This should be tuned to handle universal user requests about the data. Should also handle prompt injection and stay relevant to the topic


Implementation:
Tests should be implemented before agent implementation. All tests separately should be agreed upon with me beforehand.

The agent should gracefully handle all possible errors and continue its work.

The agent should be claude sonnet 4.5. This, however, should be easily configurable.

Any nuances should be dicussed with me - in no way can you make architecture decisions without first consulting with me. Its important.

I want every langgraph node, state, edge and prompt decision to be discussed and agreed with me.

Document all of the development decisions in a doc somewhere in the process. 

Go step-by-step, consult, dont try to do it all at once. Start with tests.