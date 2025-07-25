/// check if i am amin or not break the third wall 

import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Users from "../models/User.js";


export const isAdmin = async (req,res)=>{
    res.json({success:true , isAdmin:true})
}

// api to get into dasboard
export const getDashboardData = async(req,res )=>{
    try {
        const bookings = await Booking.find({isPaid: true});
        const activeShows = await Show.find({showDateTime: {$gte: new Date()}}).populate('movie');
        const totalUsers = await Users.countDocuments();


        const dashboardData ={
            totalBookings:bookings.length,
            totalRevenue:bookings.reduce((acc, booking) => acc + booking.amount, 0),
            activeShows,
            totalUsers


        }
        res.json({success:true,dashboardData})



    } 
    
    
    catch (error) {
        console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}


//api to get all shows
export const getAllShows= async (req,res)=>{




    try {

        const shows =await Show.find({
            showDateTime:{$gte: new Date()}
        }).populate('movie').sort({showDateTime:1})
         res.json({success:true,shows})

    } catch (error) {

         console.log(error.message);
        res.json({success:false,message:error.message})

        
    }}


    //Api to get all bookings
    export const getAllBookings = async (req,res)=>{

        try {

            const bookings = await Booking.find({}).populate('user').populate({
                path:"show",
                populate:{path:"movie"}
            }).sort({ createdAt: -1 });  // Mongo default timestamp is `createdAt`



            res.json({success:true, bookings});
            
        } 
        
        catch (error) {

            console.log(error.message);
            res.json({success:false,message:error.message});
            
        }

    } 