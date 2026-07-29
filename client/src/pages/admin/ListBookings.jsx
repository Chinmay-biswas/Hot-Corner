import React, { useCallback, useEffect, useState } from 'react'

import Title from '../../components/admin/Title';
import Loading from '../../components/Loading';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContextCore';

const ListBookings = () => {


  const{axios,getToken,user}=useAppContext(); 


  const currency = import.meta.env.VITE_CURRENCY
      const [bookings, setBookings] = useState([]);
      const [isLoading, setIsLoading] = useState(true)
  const getAllBookings = useCallback(async()=>{
    try {
      setIsLoading(true)
      const {data}= await axios.get('/api/admin/all-bookings',{
      headers:{Authorization:`Bearer ${await getToken()}`}
    });
    if(data.success){
      setBookings(data.bookings)
    }
    } catch (error) {
       console.error(error)
    } finally {
      setIsLoading(false)
    }
  }, [axios, getToken]);

  useEffect(() => {
    if(user){getAllBookings();}
  }, [getAllBookings, user]);



  return !isLoading ?(
    <>
      <Title text1="List" text2="Bookings"/> 
      <div className='max-w-4xl mt-6 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>

          <thead>
            <tr className='bg-primary/50 text-left text-white'>

            <th className='p-2 font-medium pl-5'>User Name</th>
            <th className='p-2 font-medium pl-5'>Contact</th>
            <th className='p-2 font-medium pl-5'>Movie Name</th>
            <th className='p-2 font-medium pl-5'>Show Time</th>
            <th className='p-2 font-medium pl-5'>Seats</th>
            <th className='p-2 font-medium pl-5'>Amount</th>

            </tr>
        </thead>
        <tbody className='text-sm font-light'>
                    {bookings.map((item,index)=>(
                        <tr key={index} className='border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20'>
                            <td className='p-2 min-w-45 pl-5'>{item.user?.name}</td>
                            <td className='p-2 min-w-55 pl-5'>
                              <p>{item.customerEmail || item.user?.email}</p>
                              <p className='text-gray-400'>{item.customerPhone || item.user?.phone || 'No phone'}</p>
                            </td>
                            <td className='p-2 min-w-45 pl-5'>{item.show.movie.title}</td>
                            <td className='p-2 '>{dateFormat(item.show.showDateTime)}</td>
                            <td className='p-2 '>{Object.keys(item.bookedSeats).map(seat=>item.bookedSeats[seat]).join(", ")}</td>
                            <td className='p-2 '>{currency}{item.amount}</td>
        
                        </tr>
                    ))}
        
                </tbody>


        </table>
        
      </div>
    </>
  ):(<Loading/> )
}


export default ListBookings
