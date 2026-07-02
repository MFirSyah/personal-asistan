/**
 * AI Database Tools - Tool Definitions for Gemini Function Calling
 *
 * These tools allow the AI to:
 * - Read database schema (introspection)
 * - Execute validated SQL statements
 * - Get available tables
 */

import { Type } from '@google/genai';

// Define tools in Gemini's expected format
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
    name: "execute_database_query",
    description: "Execute a SQL query on the database.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        statement: {
          type: Type.STRING,
          description: "The SQL statement to execute."
        },
        table_name: {
          type: Type.STRING,
          description: "The target table name."
        },
        intent: {
          type: Type.STRING,
          enum: ["insert", "update", "delete", "select", "alter"],
          description: "The intent of this query."
        }
      },
      required: ["statement", "table_name", "intent"]
    }
  },
  {
    name: "list_available_tables",
    description: "List all available tables in the database.",
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
