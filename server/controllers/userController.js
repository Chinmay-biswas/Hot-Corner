/// api to cotrooll users ,bookings

import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking";

export const getUserBookings = async (requestAnimationFrame,res)=>{

try {

    const user = requestAnimationFrame.auth().userId;
    const bookings = await Booking.find({user}).populate({
        path: "show",
        populate: {path: "movie"}
    }).sort({createdAt : -1})

    res.json({success:true,bookings})

} 

catch (error) {
    
console.log(error.message);
        res.json({success:false,message:error.message});


}

}


//fav user list in clerk meta data 


export const addFavorite =async (req,res)=>{
    try {

        const {movieId} =req.body;

        const userId = requestAnimationFrame.auth().userId;

        const user = await clerkClient.users.getUser(userId)

        if(!user.privateMetadata.favorites){
            user.privateMetadata.favorites=[]
        }

        if(!user.privateMetadata.favorites.includes(movieId)){
            user.privateMetadata.favorites.push(movieId)
        }




        





    } catch (error) {console.log(error.message);
        res.json({success:false,message:error.message});
        
    }
}