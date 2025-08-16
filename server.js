require("dotenv").config();
const { connect } = require("./config/db");

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

connect();

// Configure CORS for Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*", // Configure this to your frontend URL in production
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");

// Use routes
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

// Ticket Management System
class TicketManager {
  constructor() {
    this.tickets = new Map(); // ticketId -> ticket data
    this.customerSockets = new Map(); // customerId -> socket info
    this.agentSockets = new Map(); // agentId -> socket info
    this.ticketAssignments = new Map(); // ticketId -> agentId
    this.agentTickets = new Map(); // agentId -> Set of ticketIds
    this.ticketCounter = 1;
  }

  // Generate unique ticket ID
  generateTicketId() {
    return `TICKET-${Date.now()}-${this.ticketCounter++}`;
  }

  // Create new ticket for customer
  createTicket(customerId, customerSocketId, initialMessage = null) {
    const ticketId = this.generateTicketId();
    const ticket = {
      id: ticketId,
      customerId,
      customerSocketId,
      status: "open", // open, assigned, resolved, closed
      priority: "normal", // low, normal, high, urgent
      assignedAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      customerInfo: {
        connectedAt: new Date(),
        lastSeen: new Date(),
      },
    };

    if (initialMessage) {
      ticket.messages.push({
        id: this.generateMessageId(),
        content: initialMessage,
        sender: "customer",
        timestamp: new Date(),
        read: false,
      });
    }

    this.tickets.set(ticketId, ticket);
    return ticket;
  }

  // Get available agent
  getAvailableAgent() {
    const availableAgents = Array.from(this.agentSockets.values())
      .filter((agent) => agent.status === "available")
      .sort((a, b) => {
        const aTicketCount = this.agentTickets.get(a.id)?.size || 0;
        const bTicketCount = this.agentTickets.get(b.id)?.size || 0;
        return aTicketCount - bTicketCount;
      });

    return availableAgents.length > 0 ? availableAgents[0] : null;
  }

  // Assign ticket to agent
  assignTicket(ticketId, agentId) {
    const ticket = this.tickets.get(ticketId);
    const agent = this.agentSockets.get(agentId);

    if (!ticket || !agent) return false;

    ticket.assignedAgent = agentId;
    ticket.status = "assigned";
    ticket.updatedAt = new Date();

    this.ticketAssignments.set(ticketId, agentId);

    if (!this.agentTickets.has(agentId)) {
      this.agentTickets.set(agentId, new Set());
    }
    this.agentTickets.get(agentId).add(ticketId);

    return true;
  }

  // Add message to ticket
  addMessage(ticketId, content, sender, senderId = null) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    const message = {
      id: this.generateMessageId(),
      content,
      sender, // 'customer', 'agent', 'system'
      senderId,
      timestamp: new Date(),
      read: false,
    };

    ticket.messages.push(message);
    ticket.updatedAt = new Date();

    return message;
  }

  // Get ticket by customer socket ID
  getTicketByCustomer(customerSocketId) {
    for (const [ticketId, ticket] of this.tickets.entries()) {
      if (
        ticket.customerSocketId === customerSocketId &&
        ["open", "assigned"].includes(ticket.status)
      ) {
        return ticket;
      }
    }
    return null;
  }

  // Get tickets for agent
  getAgentTickets(agentId) {
    const ticketIds = this.agentTickets.get(agentId) || new Set();
    const tickets = [];

    for (const ticketId of ticketIds) {
      const ticket = this.tickets.get(ticketId);
      if (ticket && ["assigned", "open"].includes(ticket.status)) {
        tickets.push(this.getTicketSummary(ticket));
      }
    }

    return tickets.sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  // Get ticket summary for agent dashboard
  getTicketSummary(ticket) {
    const lastMessage = ticket.messages[ticket.messages.length - 1];
    const unreadCount = ticket.messages.filter(
      (m) => !m.read && m.sender === "customer"
    ).length;

    return {
      id: ticket.id,
      customerId: ticket.customerId,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messageCount: ticket.messages.length,
      unreadCount,
      lastMessage: lastMessage
        ? {
            content:
              lastMessage.content.substring(0, 100) +
              (lastMessage.content.length > 100 ? "..." : ""),
            timestamp: lastMessage.timestamp,
            sender: lastMessage.sender,
          }
        : null,
    };
  }

  // Close ticket
  closeTicket(ticketId, closedBy) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return false;

    ticket.status = "closed";
    ticket.updatedAt = new Date();
    ticket.closedAt = new Date();
    ticket.closedBy = closedBy;

    // Remove from agent's active tickets
    if (ticket.assignedAgent) {
      const agentTickets = this.agentTickets.get(ticket.assignedAgent);
      if (agentTickets) {
        agentTickets.delete(ticketId);
      }
    }

    this.ticketAssignments.delete(ticketId);
    return true;
  }

  // Generate message ID
  generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Get system statistics
  getStats() {
    const totalTickets = this.tickets.size;
    const openTickets = Array.from(this.tickets.values()).filter(
      (t) => t.status === "open"
    ).length;
    const assignedTickets = Array.from(this.tickets.values()).filter(
      (t) => t.status === "assigned"
    ).length;
    const closedTickets = Array.from(this.tickets.values()).filter(
      (t) => t.status === "closed"
    ).length;

    return {
      totalTickets,
      openTickets,
      assignedTickets,
      closedTickets,
      activeAgents: Array.from(this.agentSockets.values()).filter(
        (a) => a.status === "available"
      ).length,
      totalAgents: this.agentSockets.size,
      activeCustomers: this.customerSockets.size,
    };
  }
}

// Initialize ticket manager
const ticketManager = new TicketManager();

// Create separate namespaces for customers and agents
const customerNamespace = io.of("/customer");
const agentNamespace = io.of("/agent");

// Customer namespace handling
customerNamespace.on("connection", (socket) => {
  console.log(`Customer connected: ${socket.id}`);

  // Store customer socket info
  ticketManager.customerSockets.set(socket.id, {
    id: socket.id,
    connectedAt: new Date(),
    lastActivity: new Date(),
  });

  // Send welcome message
  socket.emit("chat_response", {
    message: "Hello! Welcome to our support chat. How can we help you today?",
    timestamp: new Date().toISOString(),
    messageId: ticketManager.generateMessageId(),
    sender: "system",
    messageType: "welcome",
  });

  // Handle customer messages
  socket.on("chat_message", (data, callback) => {
    console.log(`Customer message from ${socket.id}: ${data.message}`);

    // Update last activity
    const customerInfo = ticketManager.customerSockets.get(socket.id);
    if (customerInfo) {
      customerInfo.lastActivity = new Date();
    }

    // Get or create ticket for this customer
    let ticket = ticketManager.getTicketByCustomer(socket.id);

    if (!ticket) {
      ticket = ticketManager.createTicket(socket.id, socket.id, data.message);
      console.log(
        `Created new ticket: ${ticket.id} for customer: ${socket.id}`
      );
    } else {
      // Add message to existing ticket
      ticketManager.addMessage(ticket.id, data.message, "customer");
    }

    // Acknowledge message received
    if (callback && typeof callback === "function") {
      callback({
        status: "received",
        messageId: ticketManager.generateMessageId(),
        timestamp: new Date().toISOString(),
        ticketId: ticket.id,
      });
    }

    // Try to assign to available agent
    if (ticket.status === "open") {
      const availableAgent = ticketManager.getAvailableAgent();

      if (availableAgent) {
        // Assign ticket to agent
        ticketManager.assignTicket(ticket.id, availableAgent.id);

        // Notify agent about new ticket
        agentNamespace.to(availableAgent.socketId).emit("new_ticket", {
          ticket: ticketManager.getTicketSummary(ticket),
          message: {
            content: data.message,
            sender: "customer",
            timestamp: new Date().toISOString(),
          },
        });

        // Notify customer that agent is connecting
        socket.emit("chat_response", {
          message: "An agent will be with you shortly. Please wait a moment...",
          timestamp: new Date().toISOString(),
          messageId: ticketManager.generateMessageId(),
          sender: "system",
          messageType: "agent_connecting",
        });
      } else {
        // No agents available
        socket.emit("chat_response", {
          message:
            "All our agents are currently busy. Your message has been recorded and an agent will respond as soon as possible. Thank you for your patience.",
          timestamp: new Date().toISOString(),
          messageId: ticketManager.generateMessageId(),
          sender: "system",
          messageType: "no_agents_available",
        });
      }
    } else if (ticket.status === "assigned" && ticket.assignedAgent) {
      // Forward message to assigned agent
      const agentSocket = ticketManager.agentSockets.get(ticket.assignedAgent);
      if (agentSocket) {
        agentNamespace.to(agentSocket.socketId).emit("customer_message", {
          ticketId: ticket.id,
          message: {
            content: data.message,
            sender: "customer",
            timestamp: new Date().toISOString(),
            messageId: ticketManager.generateMessageId(),
          },
          customerInfo: {
            id: socket.id,
            lastActivity: new Date().toISOString(),
          },
        });
      }
    }
  });

  // Handle customer typing
  socket.on("typing", (data) => {
    const ticket = ticketManager.getTicketByCustomer(socket.id);
    if (ticket && ticket.assignedAgent) {
      const agentSocket = ticketManager.agentSockets.get(ticket.assignedAgent);
      if (agentSocket) {
        agentNamespace.to(agentSocket.socketId).emit("customer_typing", {
          ticketId: ticket.id,
          isTyping: data.isTyping,
        });
      }
    }
  });

  // Handle customer disconnect
  socket.on("disconnect", (reason) => {
    console.log(`Customer disconnected: ${socket.id}, reason: ${reason}`);

    const ticket = ticketManager.getTicketByCustomer(socket.id);
    if (ticket && ticket.assignedAgent) {
      // Notify agent that customer disconnected
      const agentSocket = ticketManager.agentSockets.get(ticket.assignedAgent);
      if (agentSocket) {
        agentNamespace.to(agentSocket.socketId).emit("customer_disconnected", {
          ticketId: ticket.id,
          disconnectedAt: new Date().toISOString(),
        });
      }
    }

    ticketManager.customerSockets.delete(socket.id);
  });
});

// Agent namespace handling
agentNamespace.on("connection", (socket) => {
  console.log(`Agent attempting to connect: ${socket.id}`);

  // Handle agent authentication
  socket.on("authenticate", (data) => {
    const { agentId, agentName, department } = data;

    // In production, verify agent credentials here
    if (!agentId || !agentName) {
      socket.emit("auth_error", { message: "Invalid credentials" });
      return;
    }

    // Store agent socket info
    ticketManager.agentSockets.set(agentId, {
      id: agentId,
      socketId: socket.id,
      name: agentName,
      department: department || "General Support",
      status: "available", // available, busy, away
      connectedAt: new Date(),
      lastActivity: new Date(),
    });

    socket.agentId = agentId;

    console.log(`Agent authenticated: ${agentName} (${agentId})`);

    // Send authentication success and agent dashboard data
    socket.emit("auth_success", {
      agentId,
      agentName,
      department,
      tickets: ticketManager.getAgentTickets(agentId),
      stats: ticketManager.getStats(),
    });

    // Broadcast agent status to other agents
    socket.broadcast.emit("agent_status_change", {
      agentId,
      agentName,
      status: "available",
    });
  });

  // Handle agent messages to customers
  socket.on("send_message", (data) => {
    const { ticketId, message } = data;
    const agentId = socket.agentId;

    if (!agentId) {
      socket.emit("error", { message: "Not authenticated" });
      return;
    }

    const ticket = ticketManager.tickets.get(ticketId);
    if (!ticket || ticket.assignedAgent !== agentId) {
      socket.emit("error", {
        message: "Ticket not found or not assigned to you",
      });
      return;
    }

    // Add message to ticket
    const messageObj = ticketManager.addMessage(
      ticketId,
      message,
      "agent",
      agentId
    );

    // Send message to customer
    const customerSocketId = ticket.customerSocketId;
    customerNamespace.to(customerSocketId).emit("chat_response", {
      message,
      timestamp: messageObj.timestamp.toISOString(),
      messageId: messageObj.id,
      sender: "agent",
      messageType: "response",
    });

    // Confirm message sent to agent
    socket.emit("message_sent", {
      ticketId,
      messageId: messageObj.id,
      timestamp: messageObj.timestamp.toISOString(),
    });
  });

  // Handle agent typing indicators
  socket.on("typing", (data) => {
    const { ticketId, isTyping } = data;
    const agentId = socket.agentId;

    const ticket = ticketManager.tickets.get(ticketId);
    if (ticket && ticket.assignedAgent === agentId) {
      customerNamespace
        .to(ticket.customerSocketId)
        .emit("typing", { isTyping });
    }
  });

  // Handle ticket status changes
  socket.on("update_ticket_status", (data) => {
    const { ticketId, status } = data;
    const agentId = socket.agentId;

    const ticket = ticketManager.tickets.get(ticketId);
    if (ticket && ticket.assignedAgent === agentId) {
      ticket.status = status;
      ticket.updatedAt = new Date();

      socket.emit("ticket_updated", {
        ticketId,
        status,
        updatedAt: ticket.updatedAt.toISOString(),
      });

      // If closing ticket, notify customer
      if (status === "closed") {
        ticketManager.closeTicket(ticketId, agentId);
        customerNamespace.to(ticket.customerSocketId).emit("chat_response", {
          message:
            "This support session has been closed. Thank you for contacting us! Feel free to start a new conversation if you need further assistance.",
          timestamp: new Date().toISOString(),
          messageId: ticketManager.generateMessageId(),
          sender: "system",
          messageType: "session_closed",
        });
      }
    }
  });

  // Handle agent status changes
  socket.on("update_status", (data) => {
    const { status } = data;
    const agentId = socket.agentId;

    const agentInfo = ticketManager.agentSockets.get(agentId);
    if (agentInfo) {
      agentInfo.status = status;
      agentInfo.lastActivity = new Date();

      // Broadcast status change to other agents
      socket.broadcast.emit("agent_status_change", {
        agentId,
        agentName: agentInfo.name,
        status,
      });
    }
  });

  // Get ticket details
  socket.on("get_ticket_details", (data) => {
    const { ticketId } = data;
    const agentId = socket.agentId;

    const ticket = ticketManager.tickets.get(ticketId);
    if (ticket && ticket.assignedAgent === agentId) {
      // Mark messages as read
      ticket.messages.forEach((msg) => {
        if (msg.sender === "customer") {
          msg.read = true;
        }
      });

      socket.emit("ticket_details", {
        ticket: {
          ...ticket,
          messages: ticket.messages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
          })),
        },
      });
    }
  });

  // Handle agent disconnect
  socket.on("disconnect", (reason) => {
    const agentId = socket.agentId;
    console.log(`Agent disconnected: ${agentId}, reason: ${reason}`);

    if (agentId) {
      // Update agent status
      const agentInfo = ticketManager.agentSockets.get(agentId);
      if (agentInfo) {
        agentInfo.status = "offline";

        // Broadcast status change
        socket.broadcast.emit("agent_status_change", {
          agentId,
          agentName: agentInfo.name,
          status: "offline",
        });
      }

      ticketManager.agentSockets.delete(agentId);
    }
  });
});

// REST API endpoints for admin dashboard
app.get("/api/tickets", (req, res) => {
  const { status, agentId, limit = 50 } = req.query;

  let tickets = Array.from(ticketManager.tickets.values());

  if (status) {
    tickets = tickets.filter((t) => t.status === status);
  }

  if (agentId) {
    tickets = tickets.filter((t) => t.assignedAgent === agentId);
  }

  tickets = tickets
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, parseInt(limit))
    .map((ticket) => ticketManager.getTicketSummary(ticket));

  res.json({ tickets, total: tickets.length });
});

app.get("/api/tickets/:ticketId", (req, res) => {
  const { ticketId } = req.params;
  const ticket = ticketManager.tickets.get(ticketId);

  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  res.json({ ticket });
});

app.get("/api/agents", (req, res) => {
  const agents = Array.from(ticketManager.agentSockets.values()).map(
    (agent) => ({
      id: agent.id,
      name: agent.name,
      department: agent.department,
      status: agent.status,
      connectedAt: agent.connectedAt,
      lastActivity: agent.lastActivity,
      activeTickets: ticketManager.agentTickets.get(agent.id)?.size || 0,
    })
  );

  res.json({ agents });
});

app.get("/api/stats", (req, res) => {
  res.json(ticketManager.getStats());
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    ...ticketManager.getStats(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Customer-Agent Support System running on port ${PORT}`);
  console.log(`📡 Customer endpoint: ws://localhost:${PORT}/customer`);
  console.log(`👥 Agent endpoint: ws://localhost:${PORT}/agent`);
  console.log(`🎫 Ticket management system initialized`);
});

// Graceful shutdown
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

function gracefulShutdown() {
  console.log("Shutdown signal received, closing server gracefully...");

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
}
