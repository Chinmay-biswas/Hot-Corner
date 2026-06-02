import express from "express"
import { protectAdmin } from "../middleware/auth.js";
import { getAllBookings, getAllShows, getAllUsers, getDashboardData, isAdmin } from "../controllers/adminController.js";

const adminRouter = express.Router();

adminRouter.get('/is-admin',protectAdmin,isAdmin)
adminRouter.get('/dashboard',protectAdmin,getDashboardData)
adminRouter.get('/all-shows',protectAdmin,getAllShows)
adminRouter.get('/all-bookings',protectAdmin,getAllBookings)
adminRouter.get('/all-users',protectAdmin,getAllUsers)


export default adminRouter
