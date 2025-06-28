import { Inngest } from "inngest";
import User from "../models/User.js";

// Inngest client
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// 1. Create User
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

// 2. Update User
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

// 3. Delete User
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-from-clerk" },
  { event: "webhook-integration/user.deleted" },
  async ({ event }) => {
    await User.findByIdAndDelete(event.data.id);
  }
);


export const functions = [syncUserCreation, syncUserUpdate, syncUserDeletion];
