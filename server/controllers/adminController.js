/// check if i am amin or not break the third wall 

import Booking from "../models/Booking";

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
            totalRevenue:bookings.reduce((acc,bookings)=>acc+ booking.amount,0),
            activeShow,
            totalUser

        }
        res.json({success:true,dashboardData})



    } 
    
    
    catch (error) {
        console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}