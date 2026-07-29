import React, { useCallback, useEffect, useState } from 'react'
import ReactPlayer from 'react-player'
import BlurCircle from './BlurCircle'
import { PlayCircleIcon } from 'lucide-react'
import { useAppContext } from '../context/AppContextCore'

const TrailersSection = () => {
  const { axios } = useAppContext()
  const [trailers, setTrailers] = useState([])
  const [currentTrailer, setCurrentTrailer] = useState(null)

  const fetchTrailers = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/show/upcoming-trailers')
      if (data.success) {
        setTrailers(data.trailers)
        setCurrentTrailer(data.trailers[0] || null)
      }
    } catch (error) {
      console.error(error)
    }
  }, [axios])

  useEffect(() => {
    fetchTrailers()
  }, [fetchTrailers])

  if (!currentTrailer) return null

  return (
    <div className='px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden'>
      <p className='text-gray-300 font-medium text-lg max-w-[960px]'>Upcoming Trailers</p>

      <div className='relative mt-6 aspect-video w-full max-w-[1960px] mx-auto border-4 border-orange-500 rounded-xl overflow-hidden'>
        <BlurCircle top='-10px' right='-100px' />
        <ReactPlayer
          url={currentTrailer.videoUrl}
          controls
          width='100%'
          height='100%'
          className='absolute top-0 left-0'
        />
      </div>

      <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-8 mt-8 max-w-xs sm:max-w-3xl mx-auto'>
        {trailers.map((trailer) => (
          <button
            key={trailer.videoUrl}
            type='button'
            className='relative text-left group-hover:opacity-50 hover:opacity-100 hover:-translate-y-1 duration-300 transition max-md:h-60 md:max-h60 cursor-pointer'
            onClick={() => setCurrentTrailer(trailer)}
          >
            <img src={trailer.image} alt={trailer.title} className='rounded-lg w-full h-full object-cover brightness-75' />
            <PlayCircleIcon strokeWidth={1.6} className='text-orange-700 hover:text-orange-500 absolute top-1/2 left-1/2 w-5 md:w-8 h-5 md:h-12 transform -translate-x-1/2 -translate-y-1/2' />
            <p className='mt-2 text-sm text-gray-300 truncate'>{trailer.title}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export default TrailersSection
