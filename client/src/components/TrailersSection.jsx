import React, { useState } from 'react'
import { dummyTrailers } from '../assets/assets'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon } from 'lucide-react'

const TrailersSection = () => {

    const [currentTrailer, setCurrentTrailer] = useState(dummyTrailers[0])
  return (
    <div className='px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden'>
        <p className='text-gray-300 font-medium text-lg max-w-[960px]'>Trailers</p>

        <div className="relative mt-6 aspect-video w-full max-w-[1960px] mx-auto border-4 border-orange-500 rounded-xl overflow-hidden">
            <BlurCircle top="-10px" right='-100px'/>
            <ReactPlayer
            url={currentTrailer.videoUrl}
            controls={false}
            width="100%"
            height="100%"
            className="absolute top-0 left-0"
        />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-8 mt-8 max-w-xs sm:max-w-3xl mx-auto">


            {dummyTrailers.map((trailer)=>(
                <div key={trailer.image} className='relative group-hover:opacity-50 hover:opacity-100 hover:-translate-y-1 duration-300 transition max-md:h-60 md:max-h60 cursor-pointer' onClick={()=>setCurrentTrailer(trailer)}>

                    <img src={trailer.image} alt="trailer" className='rounded-lg w-full h-full object-cover brightness-75'/>
                   
                    <PlayCircleIcon strokeWidth={1.6} className='text-orange-700 hover:text-orange-500 absolute top-1/2 left-1/2 w-5 md:w-8 h-5 md:h-12 transform -translate-x-1/2 -translate-y-1/2'/>
                </div>

            ))}

        </div>
        
    </div>
    
  )
}

export default TrailersSection