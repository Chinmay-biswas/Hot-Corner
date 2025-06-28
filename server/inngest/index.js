import { Inngest } from "inngest";
import User from "../models/User.js";

// Create the Inngest client
export const inngest = new Inngest({ id: "movie-ticket-booking" });

/**
 * Handle Clerk `user.created` webhook from Inngest
 */
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "webhook-integration/user.created" }, // ✅ matches what's in your Inngest dashboard
  async ({ event, step }) => {
    console.log("🔥 New user creation event received:");
    console.log(event.data);

    try {
      const { id, first_name, last_name, email_addresses, image_url } = event.data;

      if (!id || !first_name || !last_name || !email_addresses?.[0]?.email_address) {
        console.warn("⚠️ Missing required user fields:", event.data);
        return;
      }

      const userData = {
        _id: id,
        email: email_addresses[0].email_address,
        name: `${first_name} ${last_name}`,
        image: image_url,
      };

      // Optional: check if user already exists (to prevent duplicate error)
      const exists = await User.findById(id);
      if (exists) {
        console.log("ℹ️ User already exists. Skipping create.");
        return;
      }

      await User.create(userData);
      console.log("✅ User created:", userData);
    } catch (err) {
      console.error("❌ Error creating user:", err);
      throw err; // makes it show in Inngest as a failed run
    }
  }
);

// Export only this function for now
export const functions = [syncUserCreation];
