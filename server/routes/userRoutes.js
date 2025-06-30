import express from "express";
import {
  getFavorites,
  getUserBookings,
  UpdateFavorite,
} from "../controllers/userController.js";

const userRouter = express.Router();

userRouter.get('/bookings', getUserBookings);
userRouter.post('/update-favorite', UpdateFavorite); // <-- changed to POST
userRouter.get('/favorites', getFavorites);           // <-- fixed spelling: was /favorite

export default userRouter;
