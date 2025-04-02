# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- Install dependencies: `npm install`
- Lint code: `npx eslint . --fix`
- Format code: `npx prettier . --write`
- Full lint/format: `npm run lint && npm run format` (once added to package.json)

## Coding Standards
- Follow Airbnb JavaScript Style Guide
- Use async/await for asynchronous operations, not Promise chains
- Wrap API calls in try/catch blocks with proper error handling
- Variables/Functions: camelCase, Classes: PascalCase, Constants: UPPER_SNAKE_CASE
- Files: kebab-case.js preferred for Node.js files
- Max line length: 80 characters (prettier) / 120 characters (eslint warning)
- Use single quotes for strings
- Use JSDoc comments for functions, classes, and complex logic
- Error handling: Log comprehensively with context; never swallow errors
- Import order: Built-in modules, external modules, internal modules
- Config and secrets: Use environment variables; store secrets in Google Secret Manager

## Documentation Check

When working with external systems or libraries:

1. **Always check for documentation:**
   - For any external systems, APIs, libraries, or frameworks
   - When encountering unfamiliar concepts or when stuck on a problem
   - Use the WebFetchTool to look up official documentation first

2. **Documentation sources to check:**
   - Official project websites and documentation
   - GitHub repositories and their README/wiki pages
   - API references and specifications
   - Community resources (Stack Overflow, forums) as secondary sources

3. **When to use WebFetchTool:**
   - Before implementing solutions with external dependencies
   - When error messages reference specific concepts/libraries
   - When stuck on implementation details
   - To verify best practices and coding standards

4. **How to use WebFetchTool effectively:**
   - Use specific search queries with library/framework name and feature
   - Include version information when relevant
   - Use URLs from error messages or official documentation sites
   - Formulate clear prompts that extract relevant information

5. **Apply documentation findings:**
   - Follow official patterns and best practices
   - Adhere to library-specific conventions
   - Use recommended data structures and methods
   - Check for version compatibility issues

# Slack Support Bot Development Guide

## Project Overview

A Slack bot using RAG (Retrieval Augmented Generation) to answer support questions, built with Node.js, Slack Bolt, LangChain, and Google Cloud services.
 
## Memory Instructions
When using /compact to clear conversation history, ALWAYS update memory.md with:
- A timestamp
- Summary of the conversation and work accomplished
- List of files modified
- Current status and next steps
- Key decisions made
 
Review memory.md at the start of each new session to maintain context between conversations.
 
## Task Planning and Execution System
 
### Workplan Creation
Before implementing any feature or bugfix:
1. Create a dedicated workplan file in the `Documentation/Plans/` directory with naming format: `TaskID-Description.md` (e.g., `BUG-AuthFlow.md`, `FEAT-Abilities.md`)
2. Workplan structure must include:
   - **Task ID**: Simple identifier for reference (e.g., "FEAT-Abilities", "BUG-AuthFlow")
   - **Problem Statement**: Clear definition of what needs to be solved or implemented
   - **Components Involved**: Related areas of the system (broader than just files)
   - **Dependencies**: Prerequisite knowledge, components, or systems needed
   - **Implementation Checklist**: Step-by-step tasks with checkboxes
   - **Verification Steps**: How to confirm the implementation works correctly
   - **Decision Authority**: Clarify which decisions you can make independently vs which require user input
   - **Questions/Uncertainties**:
      - *Blocking*: Issues that must be resolved before proceeding
      - *Non-blocking*: Issues you can make reasonable assumptions about and proceed
   - **Acceptable Tradeoffs**: What compromises are acceptable for implementation speed
   - **Status**: One of [Not Started, In Progress, Completed, Blocked]
   - **Notes**: Any implementation decisions, challenges, or context for future reference
 
### Workplan Execution
1. Update the workplan Status from "Not Started" to "In Progress" when you begin implementation
2. Check off items in the checklist as they are completed
3. Add notes about implementation decisions or challenges encountered
4. For non-blocking uncertainties:
   - Document your working assumption
   - Proceed with implementation based on that assumption
   - Flag the assumption in the Notes section for future review
5. For blocking uncertainties:
   - Document the specific question or issue
   - Update status to "Blocked" if you cannot proceed
   - Once resolved, document the resolution and continue
6. Update the Status to "Completed" once all steps are finished and verified
 
### Memory Integration
1. After completing a workplan, update memory.md with:
   - Reference to the workplan: "Executed <Workplan Task ID>"
   - Brief summary of implementation results
   - Any notable challenges or decisions made
2. When reviewing memory.md, check referenced workplans for detailed context on previous work