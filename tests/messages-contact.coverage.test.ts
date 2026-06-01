import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { loginUser, createAuthHeaders } from "./helpers/auth";

const PREFIX = "bea-msg-";
const ts = Date.now();

// ---------- helpers ----------

function uniqueEmail(tag: string): string {
  return `${PREFIX}${tag}-${ts}@example.com`;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "GET",
      headers: { ...headers }
    })
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function put(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function del(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "DELETE",
      headers: { ...headers }
    })
  );
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

// ---------- suite ----------

describe("Messages / Contact API", () => {
  let adminHeaders: Record<string, string>;
  let seekerHeaders: Record<string, string>;
  let seekerUserId: string;

  // IDs created during tests – cleaned up in afterAll
  const createdContactIds: string[] = [];

  beforeAll(async () => {
    const adminTokens = await loginUser(app, "admin");
    adminHeaders = createAuthHeaders(adminTokens);

    const seekerTokens = await loginUser(app, "jobSeeker");
    seekerHeaders = createAuthHeaders(seekerTokens);
    seekerUserId = seekerTokens.userId;
  });

  afterAll(async () => {
    // Delete replies first (FK), then contacts
    for (const cid of createdContactIds) {
      try {
        await prisma.contactReply.deleteMany({ where: { contact_id: cid } });
        await prisma.contact.deleteMany({ where: { id: cid } });
      } catch {
        // ignore — already cleaned in test or doesn't exist
      }
    }
  });

  // ────────────────────────────────────────────────────
  // POST /messages/contact — anonymous user
  // ────────────────────────────────────────────────────

  describe("POST /messages/contact (anonymous)", () => {
    it("creates a contact as anonymous user with valid data", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "Anon User",
        email: uniqueEmail("anon"),
        message: "This is a long enough message for testing.",
        type: "general"
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.contactId).toBe("string");
      if (typeof body.contactId === "string") createdContactIds.push(body.contactId);
    });

    it("rejects anonymous with name too short", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "A",
        email: uniqueEmail("short-name"),
        message: "This message is long enough."
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("rejects anonymous with invalid email", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "Valid Name",
        email: "not-an-email",
        message: "This message is long enough."
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("rejects anonymous with missing email", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "Valid Name",
        message: "This message is long enough."
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("rejects message that is too short (< 10 chars)", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "Valid Name",
        email: uniqueEmail("short-msg"),
        message: "Short"
      });

      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("accepts a subject override", async () => {
      const { status, body } = await post("/messages/contact", {
        name: "Anon Subject",
        email: uniqueEmail("subj"),
        subject: "custom-subject",
        message: "Message with a custom subject override."
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      if (typeof body.contactId === "string") createdContactIds.push(body.contactId);
    });
  });

  // ────────────────────────────────────────────────────
  // POST /messages/contact — authenticated user
  // ────────────────────────────────────────────────────

  describe("POST /messages/contact (authenticated)", () => {
    it("creates a contact as authenticated user (no name/email in body)", async () => {
      const { status, body } = await post(
        "/messages/contact",
        { message: "Authenticated user contact message here." },
        seekerHeaders
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      if (typeof body.contactId === "string") createdContactIds.push(body.contactId);
    });

    it("still rejects too-short message when authenticated", async () => {
      const { status, body } = await post(
        "/messages/contact",
        { message: "Hi" },
        seekerHeaders
      );

      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("accepts with type field", async () => {
      const { status, body } = await post(
        "/messages/contact",
        { message: "Message with type field supplied here.", type: "bug" },
        seekerHeaders
      );

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      if (typeof body.contactId === "string") createdContactIds.push(body.contactId);
    });

    it("accepts without name when user has no first/last name (email fallback)", async () => {
      // Create a user with empty first/last name
      const hashedPw = await import("../src/utils/password").then(m => m.hashPassword("TmpPwd123!"));
      const tmpUser = await prisma.user.create({
        data: {
          email: uniqueEmail("noname"),
          password: hashedPw,
          first_name: "",
          last_name: "",
          role: "user"
        }
      });

      const loginRes = await post("/auth/login", {
        email: uniqueEmail("noname"),
        password: "TmpPwd123!"
      });
      const token = (loginRes.body as { data?: { token?: string } }).data?.token;

      if (token) {
        const tmpHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const { status, body } = await post(
          "/messages/contact",
          { message: "Contact from user with no display name." },
          tmpHeaders
        );
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        if (typeof body.contactId === "string") createdContactIds.push(body.contactId);
      }

      await prisma.user.delete({ where: { id: tmpUser.id } });
    });
  });

  // ────────────────────────────────────────────────────
  // GET /messages/admin/contacts — admin listing
  // ────────────────────────────────────────────────────

  describe("GET /messages/admin/contacts", () => {
    it("returns contacts list for admin", async () => {
      const { status, body } = await get("/messages/admin/contacts?page=1&limit=5", adminHeaders);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof (body.pagination as Record<string, unknown>)?.total).toBe("number");
    });

    it("returns 403 for non-admin user", async () => {
      const { status, body } = await get("/messages/admin/contacts", seekerHeaders);

      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("returns 403 when unauthenticated", async () => {
      const { status, body } = await get("/messages/admin/contacts");

      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("handles pagination parameters", async () => {
      const { status, body } = await get("/messages/admin/contacts?page=2&limit=3", adminHeaders);

      expect(status).toBe(200);
      const pagination = body.pagination as Record<string, unknown>;
      expect(pagination?.page).toBe(2);
      expect(pagination?.limit).toBe(3);
    });

    it("uses defaults when no pagination params provided", async () => {
      const { status, body } = await get("/messages/admin/contacts", adminHeaders);
      expect(status).toBe(200);
      const pagination = body.pagination as Record<string, unknown>;
      expect(pagination?.page).toBe(1);
      expect(pagination?.limit).toBe(10);
    });
  });

  // ────────────────────────────────────────────────────
  // GET /messages/contacts/:id
  // ────────────────────────────────────────────────────

  describe("GET /messages/contacts/:id", () => {
    let contactId: string;

    beforeAll(async () => {
      // Seed a contact owned by the seeker
      const contact = await prisma.contact.create({
        data: {
          sender_id: seekerUserId,
          sender_name: "Seeker User",
          sender_email: uniqueEmail("get-by-id"),
          subject: "test-get",
          message: "Test contact to read by ID.",
          is_sender_logged_in: true
        }
      });
      contactId = contact.id;
      createdContactIds.push(contactId);
    });

    it("admin can fetch contact by ID", async () => {
      const { status, body } = await get(`/messages/contacts/${contactId}`, adminHeaders);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect((body.data as Record<string, unknown>)?.id).toBe(contactId);
    });

    it("sender (seeker) can fetch their own contact", async () => {
      const { status, body } = await get(`/messages/contacts/${contactId}`, seekerHeaders);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 403 for a different non-admin user", async () => {
      // Create another contact owned by a different user
      const otherUser = await prisma.user.create({
        data: {
          email: uniqueEmail("other-user"),
          first_name: "Other",
          last_name: "User",
          role: "user"
        }
      });

      const contact2 = await prisma.contact.create({
        data: {
          sender_id: otherUser.id,
          sender_name: "Other User",
          sender_email: uniqueEmail("other-contact"),
          subject: "test-403",
          message: "Contact not belonging to seeker.",
          is_sender_logged_in: true
        }
      });
      createdContactIds.push(contact2.id);

      // seeker tries to read other user's contact
      const { status, body } = await get(`/messages/contacts/${contact2.id}`, seekerHeaders);
      expect(status).toBe(403);
      expect(body.success).toBe(false);

      // Cleanup
      await prisma.contact.deleteMany({ where: { id: contact2.id } });
      createdContactIds.splice(createdContactIds.indexOf(contact2.id), 1);
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it("returns 404 for non-existent contact ID", async () => {
      const fakeId = "000000000000000000000000";
      const { status, body } = await get(`/messages/contacts/${fakeId}`, adminHeaders);
      expect(status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────
  // GET /messages/user/me/contacts
  // ────────────────────────────────────────────────────

  describe("GET /messages/user/me/contacts", () => {
    it("returns contacts for authenticated user", async () => {
      const { status, body } = await get("/messages/user/me/contacts?page=1&limit=10", seekerHeaders);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      const { status, body } = await get("/messages/user/me/contacts");

      expect(status).toBe(401);
      expect(body.success).toBe(false);
    });

    it("handles pagination", async () => {
      const { status, body } = await get("/messages/user/me/contacts?page=2&limit=5", seekerHeaders);
      expect(status).toBe(200);
      const pagination = body.pagination as Record<string, unknown>;
      expect(pagination?.page).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────
  // GET /messages/admin/unread-count
  // ────────────────────────────────────────────────────

  describe("GET /messages/admin/unread-count", () => {
    it("returns unread count for admin", async () => {
      const { status, body } = await get("/messages/admin/unread-count", adminHeaders);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof (body.data as Record<string, unknown>)?.count).toBe("number");
    });

    it("returns 403 for non-admin", async () => {
      const { status, body } = await get("/messages/admin/unread-count", seekerHeaders);

      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("returns 403 when unauthenticated", async () => {
      const { status, body } = await get("/messages/admin/unread-count");

      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────
  // Reply CRUD
  // ────────────────────────────────────────────────────

  describe("Reply lifecycle (POST reply, PUT update, DELETE)", () => {
    let contactId: string;
    let replyId: string;

    beforeAll(async () => {
      const contact = await prisma.contact.create({
        data: {
          sender_id: seekerUserId,
          sender_name: "Reply Test User",
          sender_email: uniqueEmail("reply-test"),
          subject: "reply-subject",
          message: "Contact awaiting a reply.",
          is_sender_logged_in: true
        }
      });
      contactId = contact.id;
      createdContactIds.push(contactId);
    });

    // ─── POST /messages/contacts/:id/reply ───────────

    it("returns 403 when non-admin tries to reply", async () => {
      const { status, body } = await post(
        `/messages/contacts/${contactId}/reply`,
        { message: "Non-admin reply attempt." },
        seekerHeaders
      );
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("returns 404 when contact not found", async () => {
      const fakeId = "000000000000000000000000";
      const { status, body } = await post(
        `/messages/contacts/${fakeId}/reply`,
        { message: "Reply to missing contact." },
        adminHeaders
      );
      expect(status).toBe(404);
      expect(body.success).toBe(false);
    });

    it("returns 400 when reply message is empty", async () => {
      const { status, body } = await post(
        `/messages/contacts/${contactId}/reply`,
        { message: "" },
        adminHeaders
      );
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("admin can reply to a contact", async () => {
      const { status, body } = await post(
        `/messages/contacts/${contactId}/reply`,
        { message: "This is the admin reply." },
        adminHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(typeof data?.id).toBe("string");
      replyId = data.id as string;
    });

    // ─── PUT /messages/contacts/:id/replies/:replyId ─

    it("returns 403 for non-admin on update reply", async () => {
      const { status, body } = await put(
        `/messages/contacts/${contactId}/replies/${replyId}`,
        { message: "Non-admin update." },
        seekerHeaders
      );
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("returns 400 when update message is empty", async () => {
      const { status, body } = await put(
        `/messages/contacts/${contactId}/replies/${replyId}`,
        { message: "" },
        adminHeaders
      );
      expect(status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("admin can update a reply", async () => {
      const { status, body } = await put(
        `/messages/contacts/${contactId}/replies/${replyId}`,
        { message: "Updated admin reply." },
        adminHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data?.message).toBe("Updated admin reply.");
    });

    // ─── DELETE /messages/contacts/:id/replies/:replyId

    it("returns 403 for non-admin trying to delete reply", async () => {
      const { status, body } = await del(
        `/messages/contacts/${contactId}/replies/${replyId}`,
        seekerHeaders
      );
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("admin can delete a reply", async () => {
      const { status, body } = await del(
        `/messages/contacts/${contactId}/replies/${replyId}`,
        adminHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────
  // PUT /messages/contacts/:id/mark-read
  // ────────────────────────────────────────────────────

  describe("PUT /messages/contacts/:id/mark-read", () => {
    let contactId: string;
    let seededReplyId: string;

    beforeAll(async () => {
      const contact = await prisma.contact.create({
        data: {
          sender_id: seekerUserId,
          sender_name: "Mark Read User",
          sender_email: uniqueEmail("mark-read"),
          subject: "mark-read-test",
          message: "Contact to mark replies as read.",
          is_sender_logged_in: true
        }
      });
      contactId = contact.id;
      createdContactIds.push(contactId);

      // Seed an unread reply
      const reply = await prisma.contactReply.create({
        data: {
          contact_id: contactId,
          replier_id: seekerUserId,
          message: "Unread reply.",
          read_by_sender: false
        }
      });
      seededReplyId = reply.id;
    });

    afterAll(async () => {
      if (seededReplyId) {
        await prisma.contactReply.deleteMany({ where: { id: seededReplyId } });
      }
    });

    it("sender can mark all replies as read", async () => {
      const { status, body } = await put(
        `/messages/contacts/${contactId}/mark-read`,
        {},
        seekerHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.count).toBe("number");
    });

    it("admin can mark replies as read", async () => {
      // Seed another unread reply
      const r = await prisma.contactReply.create({
        data: {
          contact_id: contactId,
          replier_id: seekerUserId,
          message: "Another unread.",
          read_by_sender: false
        }
      });

      const { status, body } = await put(
        `/messages/contacts/${contactId}/mark-read`,
        {},
        adminHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);

      await prisma.contactReply.deleteMany({ where: { id: r.id } });
    });

    it("returns 403 when a different non-admin user tries to mark as read", async () => {
      const otherContact = await prisma.contact.create({
        data: {
          sender_id: "6f6f6f6f6f6f6f6f6f6f6f6f", // some other user
          sender_name: "Unowned Contact",
          sender_email: uniqueEmail("unowned"),
          subject: "test",
          message: "Not the seeker's contact.",
          is_sender_logged_in: true
        }
      });
      createdContactIds.push(otherContact.id);

      const { status, body } = await put(
        `/messages/contacts/${otherContact.id}/mark-read`,
        {},
        seekerHeaders
      );
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("returns 404 for non-existent contact", async () => {
      const fakeId = "000000000000000000000000";
      const { status, body } = await put(
        `/messages/contacts/${fakeId}/mark-read`,
        {},
        adminHeaders
      );
      expect(status).toBe(404);
      expect(body.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────
  // DELETE /messages/contacts/:id
  // ────────────────────────────────────────────────────

  describe("DELETE /messages/contacts/:id", () => {
    let contactToDeleteId: string;

    beforeAll(async () => {
      const contact = await prisma.contact.create({
        data: {
          sender_name: "Delete Me",
          sender_email: uniqueEmail("delete-me"),
          subject: "to-delete",
          message: "This contact should be deleted.",
          is_sender_logged_in: false
        }
      });
      contactToDeleteId = contact.id;
    });

    it("returns 403 for non-admin trying to delete contact", async () => {
      const { status, body } = await del(
        `/messages/contacts/${contactToDeleteId}`,
        seekerHeaders
      );
      expect(status).toBe(403);
      expect(body.success).toBe(false);
    });

    it("admin can delete a contact", async () => {
      const { status, body } = await del(
        `/messages/contacts/${contactToDeleteId}`,
        adminHeaders
      );
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────
  // Contact Service — direct layer tests
  // ────────────────────────────────────────────────────

  describe("contact.service — direct tests", () => {
    let directContactId: string;
    let directReplyId: string;

    beforeAll(async () => {
      const {
        createContact,
        replyToContact
      } = await import("../src/services/contact/contact.service");

      const contact = await createContact({
        sender_name: "Direct Test User",
        sender_email: uniqueEmail("direct"),
        subject: "direct-subject",
        message: "Direct service test message.",
        is_sender_logged_in: false
      });
      directContactId = contact.id;
      createdContactIds.push(directContactId);

      const reply = await replyToContact({
        contact_id: directContactId,
        replier_id: seekerUserId,
        message: "Direct reply."
      });
      directReplyId = reply.id;
    });

    afterAll(async () => {
      if (directReplyId) {
        await prisma.contactReply.deleteMany({ where: { id: directReplyId } });
      }
    });

    it("getContactById returns the contact with replies", async () => {
      const { getContactById } = await import("../src/services/contact/contact.service");
      const contact = await getContactById(directContactId);
      expect(contact).not.toBeNull();
      expect(contact?.id).toBe(directContactId);
      expect(Array.isArray(contact?.replies)).toBe(true);
    });

    it("getContactById returns null for non-existent ID", async () => {
      const { getContactById } = await import("../src/services/contact/contact.service");
      const result = await getContactById("000000000000000000000000");
      expect(result).toBeNull();
    });

    it("getAllContacts returns paginated data", async () => {
      const { getAllContacts } = await import("../src/services/contact/contact.service");
      const result = await getAllContacts(0, 10);
      expect(typeof result.total).toBe("number");
      expect(Array.isArray(result.contacts)).toBe(true);
      expect(result.page).toBe(1);
    });

    it("getAllContacts calculates page number from skip/take", async () => {
      const { getAllContacts } = await import("../src/services/contact/contact.service");
      const result = await getAllContacts(10, 10);
      expect(result.page).toBe(2);
      expect(typeof result.pages).toBe("number");
    });

    it("getContactsByUserId filters by user", async () => {
      const { getContactsByUserId } = await import("../src/services/contact/contact.service");
      const result = await getContactsByUserId(seekerUserId, 0, 10);
      expect(typeof result.total).toBe("number");
      expect(Array.isArray(result.contacts)).toBe(true);
      for (const c of result.contacts) {
        expect(c.sender_id).toBe(seekerUserId);
      }
    });

    it("getContactsByUserId page 2 returns page 2", async () => {
      const { getContactsByUserId } = await import("../src/services/contact/contact.service");
      const result = await getContactsByUserId(seekerUserId, 10, 10);
      expect(result.page).toBe(2);
    });

    it("markAllRepliesAsRead returns updated count", async () => {
      const unread = await prisma.contactReply.create({
        data: {
          contact_id: directContactId,
          replier_id: seekerUserId,
          message: "Unread direct reply.",
          read_by_sender: false
        }
      });

      const { markAllRepliesAsRead } = await import("../src/services/contact/contact.service");
      const count = await markAllRepliesAsRead(directContactId);
      expect(count).toBeGreaterThanOrEqual(1);

      await prisma.contactReply.deleteMany({ where: { id: unread.id } });
    });

    it("getUnreadRepliesCount returns a number", async () => {
      const { getUnreadRepliesCount } = await import("../src/services/contact/contact.service");
      const count = await getUnreadRepliesCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("updateReply changes the message text", async () => {
      const { updateReply } = await import("../src/services/contact/contact.service");
      const updated = await updateReply(directReplyId, "Updated direct reply.");
      expect(updated.message).toBe("Updated direct reply.");
    });

    it("markReplyAsRead marks a single reply as read", async () => {
      const { markReplyAsRead } = await import("../src/services/contact/contact.service");
      const result = await markReplyAsRead(directReplyId);
      expect(result.read_by_sender).toBe(true);
      expect(result.read_at).toBeDefined();
    });

    it("deleteReply removes the reply", async () => {
      const { deleteReply } = await import("../src/services/contact/contact.service");
      const toDelete = directReplyId;
      await deleteReply(toDelete);
      directReplyId = ""; // prevent afterAll double-delete
      const gone = await prisma.contactReply.findUnique({ where: { id: toDelete } });
      expect(gone).toBeNull();
    });

    it("deleteContact removes the contact", async () => {
      const { createContact, deleteContact } = await import("../src/services/contact/contact.service");
      const tmp = await createContact({
        sender_name: "Tmp User",
        sender_email: uniqueEmail("tmp-delete"),
        subject: "tmp",
        message: "Temporary contact to delete directly.",
        is_sender_logged_in: false
      });
      await deleteContact(tmp.id);
      const gone = await prisma.contact.findUnique({ where: { id: tmp.id } });
      expect(gone).toBeNull();
    });

    it("getUnreadContactsCount returns a number", async () => {
      const { getUnreadContactsCount } = await import("../src/services/contact/contact.service");
      const count = await getUnreadContactsCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("createContact with sender_id links to user", async () => {
      const { createContact } = await import("../src/services/contact/contact.service");
      const contact = await createContact({
        sender_id: seekerUserId,
        sender_name: "Linked User",
        sender_email: uniqueEmail("linked"),
        subject: "linked-test",
        message: "Contact linked to a real user.",
        is_sender_logged_in: true
      });
      expect(contact.id).toBeDefined();
      expect(contact.sender_id).toBe(seekerUserId);
      createdContactIds.push(contact.id);
    });
  });
});
