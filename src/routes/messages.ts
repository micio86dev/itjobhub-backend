import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import { getUserById } from "../services/users/user.service";
import {
  createContact,
  getContactById,
  getAllContacts,
  getContactsByUserId,
  replyToContact,
  markAllRepliesAsRead,
  deleteContact
} from "../services/contact/contact.service";
import logger from "../utils/logger";
import { translate } from "../i18n";

const isAdmin = (role?: string) => role === "admin";

export const messagesRoutes = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  
  // POST /messages/contact - Create new contact message
  .post(
    "/contact",
    async ({ body, user, request, set }) => {
      try {
        let { name, email } = body;
        const { subject, message, type } = body;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";

        if (user) {
          // Authenticated user - pre-fill from profile
          if (!email) email = user.email;
          if (!name) {
            const userData = await getUserById(user.id);
            if (userData) {
              name = `${userData.first_name} ${userData.last_name}`.trim();
            }
            if (!name) name = user.email;
          }
        } else {
          // Anonymous user - validate
          if (!name || name.trim().length < 2) {
            set.status = 400;
            return { success: false, message: translate("validation.error", lang) };
          }
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            set.status = 400;
            return { success: false, message: translate("validation.error", lang) };
          }
        }

        // Validate message length
        if (!message || message.trim().length < 10) {
          set.status = 400;
          return {
            success: false,
            message: translate("validation.message_too_short", lang)
          };
        }

        // Create contact in database
        const contact = await createContact({
          sender_id: user?.id,
          sender_name: name,
          sender_email: email,
          subject: subject || type || "general",
          message: message,
          is_sender_logged_in: !!user
        });

        logger.info(
          { contactId: contact.id, email: contact.sender_email },
          "Contact message created"
        );

        return {
          success: true,
          message: translate("contact.success_message", lang),
          contactId: contact.id
        };
      } catch (error) {
        logger.error({ error }, "Failed to create contact");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return {
          success: false,
          message: translate("contact.error_message", lang)
        };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
        subject: t.Optional(t.String()),
        type: t.Optional(t.String()),
        message: t.String()
      })
    }
  )

  // GET /messages/admin/contacts - Get all contacts (admin only)
  .get(
    "/admin/contacts",
    async ({ query, user, set, request }) => {
      try {
        if (!user || !isAdmin(user.role)) {
          set.status = 403;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        const page = parseInt(query.page as string) || 1;
        const limit = parseInt(query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const data = await getAllContacts(skip, limit);

        return {
          success: true,
          data: data.contacts,
          pagination: {
            page: data.page,
            limit,
            total: data.total,
            pages: data.pages
          }
        };
      } catch (error) {
        logger.error({ error }, "Failed to get contacts");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String())
      })
    }
  )

  // GET /messages/contacts/:id - Get contact by ID with replies
  .get(
    "/contacts/:id",
    async ({ params, user, set, request }) => {
      try {
        const contact = await getContactById(params.id);

        if (!contact) {
          set.status = 404;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("error.not_found", lang) };
        }

        // Check authorization: only admin or the sender can view
        if (!user || (!isAdmin(user.role) && user.id !== contact.sender_id)) {
          set.status = 403;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        return {
          success: true,
          data: contact
        };
      } catch (error) {
        logger.error({ error }, "Failed to get contact");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    }
  )

  // POST /messages/contacts/:id/reply - Reply to contact (admin only)
  .post(
    "/contacts/:id/reply",
    async ({ params, body, user, set, request }) => {
      try {
        if (!user || !isAdmin(user.role)) {
          set.status = 403;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        const contact = await getContactById(params.id);
        if (!contact) {
          set.status = 404;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("error.not_found", lang) };
        }

        if (!body.message || body.message.trim().length < 1) {
          set.status = 400;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("validation.error", lang) };
        }

        const reply = await replyToContact({
          contact_id: params.id,
          replier_id: user.id,
          message: body.message
        });

        logger.info(
          { contactId: params.id, replyId: reply.id },
          "Contact reply created"
        );

        return {
          success: true,
          message: translate("contact.reply_sent", "it"), // Default to IT, should be admin's language
          data: reply
        };
      } catch (error) {
        logger.error({ error }, "Failed to reply to contact");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    },
    {
      body: t.Object({
        message: t.String()
      })
    }
  )

  // PUT /messages/contacts/:id/mark-read - Mark all replies as read
  .put(
    "/contacts/:id/mark-read",
    async ({ params, user, set, request }) => {
      try {
        const contact = await getContactById(params.id);

        if (!contact) {
          set.status = 404;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("error.not_found", lang) };
        }

        // Check authorization: only the sender or admin can mark as read
        if (!user || (!isAdmin(user.role) && user.id !== contact.sender_id)) {
          set.status = 403;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        const count = await markAllRepliesAsRead(params.id);

        return {
          success: true,
          message: `${count} replies marked as read`,
          count
        };
      } catch (error) {
        logger.error({ error }, "Failed to mark replies as read");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    }
  )

  // GET /messages/user/me/contacts - Get logged-in user's contacts
  .get(
    "/user/me/contacts",
    async ({ query, user, set, request }) => {
      try {
        if (!user) {
          set.status = 401;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        const page = parseInt(query.page as string) || 1;
        const limit = parseInt(query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const data = await getContactsByUserId(user.id, skip, limit);

        return {
          success: true,
          data: data.contacts,
          pagination: {
            page: data.page,
            limit,
            total: data.total,
            pages: data.pages
          }
        };
      } catch (error) {
        logger.error({ error }, "Failed to get user contacts");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String())
      })
    }
  )

  // DELETE /messages/contacts/:id - Delete contact (admin only)
  .delete(
    "/contacts/:id",
    async ({ params, user, set, request }) => {
      try {
        if (!user || !isAdmin(user.role)) {
          set.status = 403;
          const acceptLanguage = request.headers.get("accept-language");
          const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
          return { success: false, message: translate("auth.unauthorized", lang) };
        }

        await deleteContact(params.id);

        logger.info({ contactId: params.id }, "Contact deleted");

        return {
          success: true,
          message: translate("contact.deleted", "it")
        };
      } catch (error) {
        logger.error({ error }, "Failed to delete contact");
        set.status = 500;
        const acceptLanguage = request.headers.get("accept-language");
        const lang = acceptLanguage ? acceptLanguage.split(",")[0].split("-")[0] : "it";
        return { success: false, message: translate("error.server_error", lang) };
      }
    }
  );
