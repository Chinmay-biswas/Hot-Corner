/// api to cotrooll users ,bookings

import { clerkClient } from "@clerk/express";
import Booking from "../models/Booking.js";
import Movie from "../models/Movie.js";

export const getUserBookings = async (req,res)=>{

try {

    const user = req.auth().userId;
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


//fav user list in clerk meta data Update

export const UpdateFavorite = async (req, res) => {
  try {
    const { movieId } = req.body;
    const userId = req.auth().userId;

    const user = await clerkClient.users.getUser(userId);
    let favorites = user.privateMetadata.favorites || [];

    // Add or remove movieId
    if (!favorites.includes(movieId)) {
      favorites.push(movieId);
    } else {
      favorites = favorites.filter(item => item !== movieId);
    }

    // Save updated metadata
    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { favorites },
    });

    res.json({ success: true, message: "Favorite movies updated successfully" });

  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};


//list of favrait movies 


export const getFavorites = async (req, res) => {
    try {
        const user = await clerkClient.users.getUser(req.auth().userId)
        const favorites = user.privateMetadata.favorites;

        ///getting movies from data base
        const movies = await Movie.find({_id: {$in: favorites}})

        res.json({success:true,movies})

    }  catch (error) {
        console.log(error.message);
        res.json({success:false,message:error.message});
    }
}