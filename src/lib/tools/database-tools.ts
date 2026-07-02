/**
 * AI Database Tools - Tool Definitions for Gemini Function Calling
 *
 * These tools allow the AI to:
 * - Read database schema (introspection)
 * - Execute validated SQL statements
 * - Get available tables
 */

export const databaseToolDefinitions = [
  {
    name: "get_database_schema",
    description: "Get the current database schema. Use this to understand table structures, columns, and relationships before executing queries. Returns schema for all tables or a specific table.",
    parameters: {
      type: "object" as const,
      properties: {
        table_name: {
          type: "string" as const,
          description: "Optional. Specific table name to get schema for. If not provided, returns all tables."
        }
      }
    }
  },
  {
    name: "execute_database_query",
    description: "Execute a SQL query on the database. Supports INSERT, UPDATE, DELETE, SELECT, and ALTER TABLE ADD COLUMN operations. All operations are validated for security before execution.",
    parameters: {
      type: "object" as const,
      properties: {
        statement: {
          type: "string" as const,
          description: "The SQL statement to execute. Supported: INSERT, UPDATE, DELETE (with WHERE), SELECT, ALTER TABLE ADD COLUMN."
        },
        table_name: {
          type: "string" as const,
          description: "The target table name for the operation."
        },
        intent: {
          type: "string" as const,
          enum: ["insert", "update", "delete", "select", "alter"],
          description: "The intent/purpose of this query for logging and validation."
        }
      },
      required: ["statement", "table_name", "intent"]
    }
  },
  {
    name: "list_available_tables",
    description: "List all available tables in the database that the AI can query or modify.",
    parameters: {
      type: "object" as const,
      properties: {}
    }
  }
];

/**
 * Tool definitions in Gemini's expected format
 */
export const geminiToolDeclarations = databaseToolDefinitions.map(tool => ({
  name: tool.name,
  description: tool.description,
  parameters: {
    type: "object" as const,
    properties: tool.parameters.properties as Record<string, any>,
    required: tool.parameters.required || []
  }
}));

/**
 * Rate limiting configuration
 */
export const rateLimits = {
  maxQueriesPerMinute: 10,
  maxQueriesPerDay: 100,
  maxQueryLength: 2000
};

/**
 * Whitelist configuration
 */
export const allowedTables = [
  'money_trackers',
  'todo_lists',
  'user_profiles',
  'payment_methods',
  'app_chat_messages',
  'chat_preferences',
  'ai_insights_cache'
];

/**
 * Allowed operations per table
 */
export const allowedOperations: Record<string, string[]> = {
  'money_trackers': ['INSERT', 'UPDATE', 'DELETE', 'SELECT'],
  'todo_lists': ['INSERT', 'UPDATE', 'DELETE', 'SELECT'],
  'user_profiles': ['UPDATE', 'SELECT'],
  'payment_methods': ['SELECT'],
  'app_chat_messages': ['INSERT', 'SELECT'],
  'chat_preferences': ['INSERT', 'UPDATE', 'SELECT'],
  'ai_insights_cache': ['INSERT', 'SELECT', 'DELETE']
};
