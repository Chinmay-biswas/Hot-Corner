import { ChartLineIcon, CircleDollarSignIcon, PlayCircleIcon, StarIcon, UsersIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react'

import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import BlurCircle from '../../components/BlurCircle';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';



const Dashboard = () => {

    const currency = import.meta.env.VITE_CURRENCY;
    const{axios,getToken,user,image_base_url}=useAppContext();

const [dashboardData, setDashboardData] = useState({
  totalBookings: 0,
  totalRevenue: 0,
  activeShows: [],
  totalUser: 0
});

const [loading, setLoading] = useState(true);

const dashboardCards = [
  { title: "Total Bookings", value: dashboardData.totalBookings || "0", icon: ChartLineIcon },
  { title: "Total Revenue", value: currency + dashboardData.totalRevenue || "0", icon: CircleDollarSignIcon },
  { title: "Active Shows", value: dashboardData.activeShows.length || "0", icon: PlayCircleIcon},
  { title: "Total Users", value: dashboardData.totalUser || "0", icon: UsersIcon }
];

const fetchDashboardData = async () => {
 
  try {
    const {data}= await axios.get("/api/admin/dashboard",{
      headers:{Authorization:`Bearer ${await getToken()}`}
    })
   if(data.success){
            setDashboardData(data.dashboardData)
            setLoading(false)
          }
          else{
            toast.error(data.message)
          }
      } catch (error) {
        toast.error("Error fetching dashboard data:",error)

        
      }
    };

useEffect(() => {

  if (user){
    fetchDashboardData();
  }
  
}, [user]);

return !loading ?(
  <>
    <Title text1="admin" text2=" Dashboard"/>
    <div className='relative flex flex-wrap gap-4 mt-6'> <BlurCircle top='-100px' left='0'/>
        <div className='relative flex flex-wrap lg:gap-4 xl:gap-10 w-full '>
            {dashboardCards.map((card, index)=>(
            <div key={index} className='flex items-center justify-between px-4 py-3 mt-3 mr-3 bg-primary/20 boarder boarder-primary/30 rounded-md max-w-50 w-full'>
                <div>
                    <h1 className='text-sm'>{card.title}</h1>
                    <p className='text-xl font-medium mt-1'>{card.value}</p>
                </div>
                <card.icon className='w-6 h-6'/>

            </div>))}

       

        </div>
    </div> <p className="mt-10 text-lg font-medium">Active Shows</p>
    <div className="relative flex flex-wrap lg:gap-6 xl:gap-16 mt-4 max-w-10xl">
        <BlurCircle top="100px" left="-10%" />

            {dashboardData.activeShows.map((show) => (
    <div key={show._id} className="w-55 rounded-lg overflow-hidden h-full pb-3 bg-primary/10 border border-primary/20 hover:-translate-y-1 transition duration-300">
      <img src={image_base_url + show.movie.poster_path} alt="" className="h-60 w-full object-cover"/>
      <p className="font-medium p-2 truncate">{show.movie.title}</p>
      <div className="flex items-center justify-between px-2">
        <p className="text-lg font-medium">
          {currency} {show.showPrice}
        </p>
        <p className="flex items-center gap-1 text-sm text-gray-400 mt-1 pr-1">
          <StarIcon className="w-4 h-4 text-primary fill-primary" />
          {show.movie.vote_average.toFixed(1)}
        </p>
      </div>
      <p>{dateFormat(show.showDateTime)}</p>
    </div>
  ))}
</div>


  </>
):


(<Loading/>)

}

export default Dashboard