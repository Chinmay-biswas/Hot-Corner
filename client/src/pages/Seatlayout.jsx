import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { assets, dummyDateTimeData, dummyShowsData, } from '../assets/assets'
import Loading from '../components/Loading'
import { ClockIcon } from 'lucide-react'
import isoTimeFormat from '../lib/isoTimeFormat'
import BlurCircle from '../components/BlurCircle'
import toast from 'react-hot-toast'

const Seatlayout = () => {

  const{id,date}=useParams()

  const[selectedSeats, setSeletedSeats]=useState([])
  const[selectedTime, setSelectedTime]=useState(null)
  const[show, setShow]=useState(null)

  const navigate =useNavigate()

  const getShow =async () =>{
    const show = dummyShowsData.find(show=> show._id ===id)
    if(show){
      setShow({
        movie: show,
        dateTime:dummyDateTimeData
      })
    }
  }

  const handleSeatClick=(seatID)=>{
    if(!selectedTime){
      return toast("Please select time first")
    }
    if(!selectedSeats.includes(seatId)&& selectedSeats.lenght >5){
      return toast("You Can only Select 6 Seat")
    }
    setSelectedSeats(prev=> prev.includes(seatID)? prev.filter(seat=>seat!==seatId):[...prev,seatId])
  }

  const renderSeats = (row, count = 9) => (
  <div key={row} className="flex gap-2 mt-2">
    <div className="flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: count }, (_, i) => {
        const seatId = `${row}${i + 1}`;
        return (
          <button
            key={seatId}
            onClick={() => handleSeatClick(seatId)}
            className={`h-8 w-8 rounded border border-primary/60 cursor-pointer ${
              selectedSeats.includes(seatId) && "bg-primary text-white"
            }`}
          >
            {seatId}
          </button>
        );
      })}
    </div>
  </div>
);


  useEffect(()=>{
    getShow()
  },[])

  return show? (
    <div className='flex flex-col md:flex-row px-6 md:px-16 lg:px-32 py-30 md:pt-50'>
      {/* Available timings */}
        <div className='w-60 bg-primary/30 border border-primary/50 rounded-lg py-10 h-max md:sticky md:top-30'>

          <p className='text-lg font-semibold px-6'>Available Timings</p>
          <div className='mt-5 space-y-1'>
          {show.dateTime[date].map((item)=>(
            <div key={item.time} onClick={()=>(setSelectedTime(item))} className={`flex items-centre gap-2 px-6 py-2 rounded-r-md font-medium cursor-pointer transition ${selectedTime?.time=== item.time ? "bg-primary text-white":"hover:bg-primary/50"}`}>
              <ClockIcon className='w-4 h-4 mt-2'/>
              <p className='text-sm py-1'>{isoTimeFormat(item.time)}</p>
            </div>
          ))}
        </div>
        </div>


      {/* seat layout */}
        <div className='relative flex-1 flex flex-col items-center max-md:mt-16'>
              <BlurCircle top='-100px' left='-100px'/>
              <BlurCircle bottom='0' right='0'/>
              <h1 className='text-2xl font-semibold mb-4'>Select your Seat</h1>
              <img src={assets.screenImage} alt="screen"/> 
              <p className='text-gray-400 text-sm mb-6'>Screen Side</p>
        </div>
    </div> 


  ):(<Loading/>)
}

export default Seatlayout