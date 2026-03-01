import { dbClient } from "../../config/database";

export interface CreateContactInput {
  sender_id?: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  message: string;
  is_sender_logged_in: boolean;
}

export interface CreateContactReplyInput {
  contact_id: string;
  replier_id: string;
  message: string;
}

/**
 * Create a new contact message
 * @param data - Contact data
 * @returns Created contact
 */
export const createContact = async (data: CreateContactInput) => {
  return await dbClient.contact.create({
    data: {
      sender_id: data.sender_id,
      sender_name: data.sender_name,
      sender_email: data.sender_email,
      subject: data.subject,
      message: data.message,
      is_sender_logged_in: data.is_sender_logged_in
    }
  });
};

/**
 * Get contact by ID with replies
 * @param contactId - Contact ID
 * @returns Contact data with replies
 */
export const getContactById = async (contactId: string) => {
  return await dbClient.contact.findUnique({
    where: { id: contactId },
    include: {
      user: true,
      replies: {
        include: {
          replier: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: {
          created_at: "asc"
        }
      }
    }
  });
};

/**
 * Get all contacts (admin only)
 * @param skip - Number of records to skip
 * @param take - Number of records to take
 * @returns Paginated contacts
 */
export const getAllContacts = async (skip: number = 0, take: number = 10) => {
  const [contacts, total] = await Promise.all([
    dbClient.contact.findMany({
      skip,
      take,
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true
          }
        },
        replies: {
          include: {
            replier: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                avatar: true
              }
            }
          },
          orderBy: {
            created_at: "asc"
          }
        }
      },
      orderBy: {
        created_at: "desc"
      }
    }),
    dbClient.contact.count()
  ]);

  return {
    contacts,
    total,
    page: Math.floor(skip / take) + 1,
    pages: Math.ceil(total / take)
  };
};

/**
 * Get contacts by user ID
 * @param userId - User ID
 * @param skip - Number of records to skip
 * @param take - Number of records to take
 * @returns Paginated contacts for user
 */
export const getContactsByUserId = async (userId: string, skip: number = 0, take: number = 10) => {
  const [contacts, total] = await Promise.all([
    dbClient.contact.findMany({
      where: {
        sender_id: userId
      },
      include: {
        replies: {
          include: {
            replier: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                avatar: true
              }
            }
          },
          orderBy: {
            created_at: "asc"
          }
        }
      },
      skip,
      take,
      orderBy: {
        created_at: "desc"
      }
    }),
    dbClient.contact.count({
      where: {
        sender_id: userId
      }
    })
  ]);

  return {
    contacts,
    total,
    page: Math.floor(skip / take) + 1,
    pages: Math.ceil(total / take)
  };
};

/**
 * Create a reply to a contact
 * @param data - Reply data
 * @returns Created reply
 */
export const replyToContact = async (data: CreateContactReplyInput) => {
  return await dbClient.contactReply.create({
    data: {
      contact_id: data.contact_id,
      replier_id: data.replier_id,
      message: data.message,
      read_by_sender: true,
      read_at: new Date()
    },
    include: {
      replier: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar: true
        }
      }
    }
  });
};

/**
 * Mark a reply as read by sender
 * @param replyId - Reply ID
 * @returns Updated reply
 */
export const markReplyAsRead = async (replyId: string) => {
  return await dbClient.contactReply.update({
    where: { id: replyId },
    data: {
      read_by_sender: true,
      read_at: new Date()
    }
  });
};

/**
 * Mark all replies for a contact as read
 * @param contactId - Contact ID
 * @returns Number of updated replies
 */
export const markAllRepliesAsRead = async (contactId: string) => {
  const result = await dbClient.contactReply.updateMany({
    where: {
      contact_id: contactId,
      read_by_sender: false
    },
    data: {
      read_by_sender: true,
      read_at: new Date()
    }
  });

  return result.count;
};

/**
 * Get unread contacts count (admin)
 * @returns Count of contacts with unread replies from admin perspective
 */
export const getUnreadContactsCount = async () => {
  const contacts = await dbClient.contact.findMany({
    where: {
      replies: {
        some: {
          read_by_sender: false
        }
      }
    },
    select: {
      id: true
    }
  });

  return contacts.length;
};

/**
 * Get unread replies count (admin)
 * @returns Count of contacts without any reply (pending messages)
 */
export const getUnreadRepliesCount = async () => {
  // Count contacts that have no replies yet (awaiting admin response)
  return await dbClient.contact.count({
    where: {
      replies: {
        none: {}
      }
    }
  });
};

/**
 * Update a reply (admin only)
 * @param replyId - Reply ID
 * @param message - New message text
 * @returns Updated reply
 */
export const updateReply = async (replyId: string, message: string) => {
  return await dbClient.contactReply.update({
    where: { id: replyId },
    data: {
      message
    },
    include: {
      replier: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar: true
        }
      }
    }
  });
};

/**
 * Delete a reply (admin only)
 * @param replyId - Reply ID
 * @returns Deleted reply
 */
export const deleteReply = async (replyId: string) => {
  return await dbClient.contactReply.delete({
    where: { id: replyId }
  });
};

/**
 * Delete a contact (admin only)
 * @param contactId - Contact ID
 * @returns Deleted contact
 */
export const deleteContact = async (contactId: string) => {
  return await dbClient.contact.delete({
    where: { id: contactId }
  });
};
