const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Load environment variables for the database client
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { searchMessages, getActionItemsByUser, saveActionItem } = require('../db/supabase');
const { synthesizeSearchResults } = require('../ai/gemini');

// Initialize MCP Server
const server = new Server(
  {
    name: 'flowdesk-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_history',
        description: 'Search the Slack workspace history and return an AI-synthesized answer.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The natural language question to ask about the workspace history.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_tasks',
        description: 'Retrieve all open action items/commitments for a specific Slack user.',
        inputSchema: {
          type: 'object',
          properties: {
            slack_user_id: {
              type: 'string',
              description: 'The Slack User ID (e.g., U0123456) to retrieve tasks for.',
            },
          },
          required: ['slack_user_id'],
        },
      },
      {
        name: 'track_commitment',
        description: 'Manually track a new commitment into the FlowDesk database.',
        inputSchema: {
          type: 'object',
          properties: {
            slack_user_id: { type: 'string' },
            slack_channel_id: { type: 'string' },
            commitment_text: { type: 'string', description: 'What the user committed to do.' },
            deadline: { type: 'string', description: 'ISO string deadline (optional)' },
          },
          required: ['slack_user_id', 'slack_channel_id', 'commitment_text'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'search_history': {
        const { query } = request.params.arguments;
        const searchResults = await searchMessages(query, 15);
        if (!searchResults || searchResults.length === 0) {
          return { content: [{ type: 'text', text: 'No relevant history found.' }] };
        }
        
        const messagesForAi = searchResults.map(msg => ({
          user: msg.slack_user_id,
          date: new Date(msg.created_at).toLocaleDateString(),
          text: msg.message_text,
        }));
        
        const answer = await synthesizeSearchResults(query, messagesForAi);
        return { content: [{ type: 'text', text: answer }] };
      }

      case 'get_tasks': {
        const { slack_user_id } = request.params.arguments;
        const tasks = await getActionItemsByUser(slack_user_id);
        
        if (tasks.length === 0) {
          return { content: [{ type: 'text', text: 'User has no open tasks.' }] };
        }
        
        const formattedTasks = tasks.map(t => 
          `- ${t.commitment_text} (Due: ${t.deadline ? new Date(t.deadline).toLocaleDateString() : 'None'})`
        ).join('\n');
        
        return { content: [{ type: 'text', text: formattedTasks }] };
      }

      case 'track_commitment': {
        const { slack_user_id, slack_channel_id, commitment_text, deadline } = request.params.arguments;
        
        const item = await saveActionItem({
          slackUserId: slack_user_id,
          slackChannelId: slack_channel_id,
          messageTs: (Date.now() / 1000).toString(), // Mock TS
          commitmentText: commitment_text,
          deadline: deadline || null,
        });
        
        return { content: [{ type: 'text', text: `Successfully tracked commitment with ID: ${item.id}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
  }
});

// Start the server using stdio transport
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('FlowDesk MCP Server running on stdio');
}

start().catch(console.error);
