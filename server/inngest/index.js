import { Inngest } from "inngest";
import User from "../models/User.js";

// Create the Inngest client
export const inngest = new Inngest({ id: "movie-ticket-booking" });

/**
 * 1. Handle Clerk user creation → Save to DB
 */
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "webhook-integration/user.created" }, 
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } = event.data;

    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: `${first_name} ${last_name}`,
      image: image_url,
    };

    await User.create(userData);
  }
);

/**
 * 2. Handle Clerk user deletion → Remove from DB
 */
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "webhook-integration/user.deleted" }, 
  async ({ event }) => {
    const { id } = event.data;
    await User.findByIdAndDelete(id);
  }
);

/**
 * 3. Handle Clerk user update → Update in DB
 */
const syncUserUpdate = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "webhook-integration/user.updated" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } = event.data;

    const userData = {
      email: email_addresses[0].email_address,
      name: `${first_name} ${last_name}`,
      image: image_url,
    };

    await User.findByIdAndUpdate(id, userData);
  }
);

// Export functions for Inngest to register
export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdate,
];
