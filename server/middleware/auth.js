import { clerkClient } from '@clerk/express';


export const protectAdmin =async (req, res, next)=>{
    try{
        const {userId}=req.auth();
        const user = await clerkClient.users.getUser(userId)
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
        const userEmails = user.emailAddresses.map(({ emailAddress }) => emailAddress.toLowerCase());

        if(user.privateMetadata.role !=='admin' && !userEmails.includes(adminEmail)){
            return res.json({success:false,message:'not Authorized'})
        }

        next();

    }catch(error){
            return res.json({success:false,message:'not Authorized'})
    }
}
