// fuction of check avalable bity of selected seats

import { err } from "inngest/types";
import Show from "../models/Show.js"
import Booking from "../models/Booking.js";

const checkSeatsAvailability = async (showId,selectedSeats)=>{
    try {
        
    const showData = await Show.findById(showId)

    if(!showData) return false;

    const occupiedSeats = showData.occupiedSeats;

    const isAnySeatTaken= selectedSeats.some(seat=>occupiedSeats[seat]);

    return !isAnySeatTaken;
    


    } 
    
    
    
    catch (error) {
        console.error(error);
        return false;
        
    }
}

export const createBooking = async(req,res)=>{

    try {
    
        const {userId}=req.auth();
        const{showId,selectedSeats}= req.body;
        const {origin} = req.headers;

        // check seats are available for selected show

        const isAvailable = await checkSeatsAvailability(showId,selectedSeats)

        if(!isAvailable){
            return res.json({success:false,message:"Selected seats are not available"})
        }
        //get the show details

        const showData = awaitShow.findById(showId).populate('movie');

        //create a new bookings

        const booking = await Booking.create({
            user:userId,
            show:showId,
            amount: showData.showPrice*selectedSeats.length,
            bookedSeats: selectedSeats
        })

            selectedSeats.map((seat)=>{
                showData.occupiedSeats[seat]=userId;

            })
            showData.markModified('occupiedSeats')

            await showData.save();

                //stripe gateway intialaze

                res.json({success:true, message: 'booked succesfully'})


    } 
    
    catch (error) {

        console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}




//occupied seats data

export const getOccupiedSeats =async (req,res)=>{
    try {

            const{showId} = req.params;
            const showData = await Show.findById(showId)

            const occupiedSeats= Object.keys(showData.occupiedSeats)

            res.json ({ success:true , message:occupiedSeats})
        
    } 
    
    
    
    catch (error) {
         console.log(error.message);
        res.json({success:false,message:error.message})
        
    }
}

