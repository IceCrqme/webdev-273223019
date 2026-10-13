
const fs = require("fs");
const readline = require("readline");

const lectures = JSON.parse(
  fs.readFileSync(__dirname + "/lectures.json", "utf8")
);

const tools = [
  {
    name: "find_lecture",
    description: "Find a course lecture by its number from 1 to 10 and return its title and topics.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "number", description: "Lecture number from 1 to 10" }
      },
      required: ["number"]
    }
  },
  {
    name: "list_lectures",
    description: "List all available course lectures with their numbers and titles.",
    inputSchema: { type: "object", properties: {} }
  }
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(message) {
  const { id, method, params = {} } = message;

  if (method === "initialize") {
    return result(id, {
      protocolVersion: params.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "course-lecture-server", version: "1.0.0" }
    });
  }

  if (method === "notifications/initialized") return;

  if (method === "ping") return result(id, {});

  if (method === "tools/list") {
    return result(id, { tools });
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = params;
    let output;

    if (name === "find_lecture") {
      const number = args.number;
      const lecture = lectures.find(
        item => Number(item.number) === Number(number)
      );

      if (!Number.isInteger(number) || number < 1 || number > 10 || !lecture) {
        output = {
          isError: true,
          content: [{ type: "text", text: "Lecture number must be an integer from 1 to 10." }]
        };
      } else {
        output = {
          content: [{ type: "text", text: JSON.stringify(lecture) }]
        };
      }
    } else if (name === "list_lectures") {
      output = {
        content: [{
          type: "text",
          text: JSON.stringify(lectures.map(item => ({
            number: item.number,
            title: item.title
          })))
        }]
      };
    } else {
      return error(id, -32602, `Unknown tool: ${name}`);
    }

    return result(id, output);
  }

  if (id !== undefined) {
    error(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

rl.on("line", line => {
  try {
    handle(JSON.parse(line));
  } catch {
    error(null, -32700, "Parse error");
  }
});