
import  {  useCallback, useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { dateFormat } from '../../lib/dateFormat';
import { useAppContext } from '../../context/AppContextCore';
import { Trash2Icon } from 'lucide-react';
import toast from 'react-hot-toast';

const ListShows = () => {

    const currency = import.meta.env.VITE_CURRENCY;

    const{axios,getToken,user}=useAppContext();

     const [shows,setShows]=useState([])
     const [loading, setLoading] = useState(true);
     const [deletingShowId,setDeletingShowId]=useState(null);
     
     const getAllShows = useCallback(async ()=>{
        try{
            setLoading(true);
            const {data}= await axios.get('/api/admin/all-shows',{
      headers:{Authorization:`Bearer ${await getToken()}`}
    });

    if(data.success){
        setShows(data.shows)
    }else{
        toast.error(data.message)
    }
        } catch(error){
            console.error(error)
            toast.error(error.response?.data?.message || 'Could not load shows')
        } finally {
            setLoading(false);
        }
     }, [axios, getToken])

     const handleDeleteShow = async(show)=>{
        const confirmed = window.confirm(`Delete ${show.movie.title} show? This will also remove bookings for this show.`);
        if(!confirmed) return;

        try{
            setDeletingShowId(show._id)
            const {data}= await axios.delete(`/api/show/${show._id}`,{
                headers:{Authorization:`Bearer ${await getToken()}`}
            });

            if(data.success){
                toast.success(data.message)
                setShows((currentShows)=>currentShows.filter((item)=>item._id !== show._id))
            }else{
                toast.error(data.message)
            }
        } catch(error){
            console.error(error)
            toast.error(error.response?.data?.message || error.message)
        } finally {
            setDeletingShowId(null)
        }
     }

     useEffect(()=>{

        if(user){
                getAllShows();
        }
        
     },[getAllShows, user]);

  return !loading?(
    <>
    <Title text1="List" text2="Shows"/>
    <div className='max-w-4xl mt-6 overflow-x-auto'>
        <table className='w-full border-collapse rounded-md overflow-hidden text-nowrap'>
        <thead>
            <tr className='bg-primary/50 text-left text-white'>


            <th className='p-2 font-medium pl-5'>Movie Name</th>
            <th className='p-2 font-medium pl-5'>Show Time</th>
            <th className='p-2 font-medium pl-5'>Total Bookings</th>
            <th className='p-2 font-medium pl-5'>Earnings</th>
            <th className='p-2 font-medium pl-5'>Action</th>

            </tr>
        </thead>
        <tbody className='text-sm font-light'>
            {shows.map((show,index)=>(
                <tr key={index} className='border-b border-primary/20 bg-primary-dull/15 even:bg-primary/20'>
                    <td className='p-2 min-w-45 pl-5'>{show.movie.title}</td>
                    <td className='p-2 '>{dateFormat(show.showDateTime)}</td>
                    <td className='p-2 '>{Object.keys(show.occupiedSeats).length}</td>
                    <td className='p-2 '>{currency}{Object.keys(show.occupiedSeats).length * show.showPrice}</td>
                    <td className='p-2 pl-5'>
                        <button
                            onClick={()=>handleDeleteShow(show)}
                            disabled={deletingShowId === show._id}
                            className='inline-flex items-center justify-center w-8 h-8 rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition disabled:opacity-50 cursor-pointer'
                            title='Delete show'
                        >
                            <Trash2Icon className='w-4 h-4'/>
                        </button>
                    </td>

                </tr>
            ))}

        </tbody>

        </table>

    </div>
    </>
  ):(<Loading/>)
}

export default ListShows
