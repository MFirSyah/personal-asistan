/**
 * AI Database Tools - Tool Definitions for Gemini Function Calling
 *
 * SECURITY: Tool definitions use structured parameters, NOT raw SQL strings.
 * SQL is built server-side using a whitelist query builder approach.
 *
 * Arsitektur reference: Bagian 11 - Opsi A (query_config whitelist)
 */

import { Type } from '@google/genai';

/**
 * Define tools in Gemini's expected format
 * Each tool uses STRUCTURED parameters, not raw SQL
 */
export const databaseToolDefinitions = [
  {
    name: "get_database_schema",
    description: "Get the current database schema. Use this to understand table structures, columns, and relationships before executing queries.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        table_name: {
          type: Type.STRING,
          description: "Optional. Specific table name to get schema for."
        }
      }
    }
  },
  {
    name: "list_finance_records",
    description: "List user's financial transactions (money trackers). Use for viewing transaction history, summaries, or checking specific records.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of records to return (default: 20, max: 100)"
        },
        type_filter: {
          type: Type.STRING,
          enum: ["income", "expense", "all"],
          description: "Filter by transaction type"
        },
        start_date: {
          type: Type.STRING,
          description: "Start date filter (ISO format: YYYY-MM-DD)"
        },
        end_date: {
          type: Type.STRING,
          description: "End date filter (ISO format: YYYY-MM-DD)"
        }
      }
    }
  },
  {
    name: "list_todo_items",
    description: "List user's tasks/todo items. Use for viewing task lists, checking pending tasks, or seeing completed tasks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of records to return (default: 20, max: 100)"
        },
        status_filter: {
          type: Type.STRING,
          enum: ["pending", "completed", "cancelled", "all"],
          description: "Filter by task status"
        }
      }
    }
  },
  {
    name: "create_finance_record",
    description: "Create a new financial transaction record. Use when user asks to record an expense or income.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["income", "expense"],
          description: "Transaction type: 'income' or 'expense'"
        },
        amount: {
          type: Type.NUMBER,
          description: "Amount in Indonesian Rupiah (number, not string)"
        },
        description: {
          type: Type.STRING,
          description: "Description or note for the transaction"
        },
        transaction_date: {
          type: Type.STRING,
          description: "Date of transaction in ISO format (YYYY-MM-DD), defaults to today"
        }
      },
      required: ["type", "amount", "description"]
    }
  },
  {
    name: "create_todo_item",
    description: "Create a new task/todo item. Use when user asks to add a task or todo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_name: {
          type: Type.STRING,
          description: "Name or description of the task"
        },
        due_date: {
          type: Type.STRING,
          description: "Due date in ISO format (YYYY-MM-DD), optional"
        },
        priority: {
          type: Type.STRING,
          enum: ["low", "medium", "high"],
          description: "Task priority level"
        }
      },
      required: ["task_name"]
    }
  },
  {
    name: "update_todo_status",
    description: "Update the status of an existing todo item. Use when user wants to mark a task as completed, cancelled, or pending.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_name: {
          type: Type.STRING,
          description: "Full or partial name of the task to update (case-insensitive match)"
        },
        new_status: {
          type: Type.STRING,
          enum: ["pending", "completed", "cancelled"],
          description: "New status for the task"
        }
      },
      required: ["task_name", "new_status"]
    }
  },
  {
    name: "get_finance_summary",
    description: "Get a summary of user's financial records for a date range. Use for answering questions about total spending, income, or balance.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: {
          type: Type.STRING,
          description: "Start date (ISO format: YYYY-MM-DD)"
        },
        end_date: {
          type: Type.STRING,
          description: "End date (ISO format: YYYY-MM-DD)"
        }
      },
      required: ["start_date", "end_date"]
    }
  },
  {
    name: "list_available_tables",
    description: "List all available tables the AI can query.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  }
];

// Export for use in chat API
export const geminiToolDeclarations = databaseToolDefinitions;

/**
 * Rate limiting configuration
 */
export const rateLimits = {
  maxQueriesPerMinute: 10,
  maxQueriesPerDay: 100
};

/**
 * Whitelist configuration - ONLY these tables can be accessed
 */
export const allowedTables = [
  'money_trackers',
  'todo_lists',
  'user_profiles',
  'chat_preferences'
];

/**
 * Allowed operations per table
 * Maps table name to allowed SQL operations
 */
export const allowedOperations: Record<string, ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[]> = {
  'money_trackers': ['SELECT', 'INSERT'],
  'todo_lists': ['SELECT', 'INSERT', 'UPDATE'],
  'user_profiles': ['SELECT', 'UPDATE'],
  'chat_preferences': ['SELECT', 'INSERT', 'UPDATE']
};

/**
 * Whitelist of allowed columns per table for SELECT queries
 * Prevents column enumeration attacks
 */
export const allowedColumns: Record<string, string[]> = {
  'money_trackers': [
    'id', 'user_id', 'type', 'amount', 'description',
    'transaction_date', 'created_at', 'updated_at', 'dynamic_metadata'
  ],
  'todo_lists': [
    'id', 'user_id', 'task_name', 'status', 'due_date',
    'waktu_mulai', 'pengingat', 'created_at', 'updated_at', 'dynamic_metadata'
  ],
  'user_profiles': [
    'id', 'fullname', 'user_nickname', 'assistant_name',
    'selected_personality', 'dynamic_metadata', 'created_at', 'updated_at'
  ],
  'chat_preferences': [
    'id', 'user_id', 'communication_style', 'explanation_style',
    'topic_frequencies', 'prefers_emoji', 'prefers_lists',
    'avoided_words', 'total_chats', 'last_chat_at', 'avg_message_length'
  ]
};
