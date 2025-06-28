import React, { useEffect, useState } from 'react'
import { dummyShowsData } from '../../assets/assets';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { StarIcon } from 'lucide-react';
import { kcon } from '../../lib/kcon';


const AddShows = () => {

    const currency = import.meta.env.VITE_CURRENCY;

    const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
    const [selectedMovies, setSelectedMovies] = useState(null);
    const [dateTimeSelection, setDateTimeSelection] = useState({});
    const [dateTimeInput, setDateTimeInput] = useState("");
    const [showPrice, setShowPrice] = useState("");

    const fetchNowPlayingMovies= async ()=>{
      setNowPlayingMovies(dummyShowsData)
    };

    useEffect(()=>{
      fetchNowPlayingMovies()
    },[]);



  return nowPlayingMovies.length > 0 ? (
    <>
    <Title text1="Add" text2="Shows"/>
    <p className='mt-20 text-lg font-medium'>Now Playing Movies</p>
      <div className='overflow-x-auto pb-4'>
        <div className='group flex flex-wrap gap-4 mt-4 w-max'>
          {nowPlayingMovies.map((movie)=>(
            <div onClick={()=>setSelectedMovies(movie._id)} key={movie.id} className={`relative max-w-40 cursor-pointer group-hover:not-hover:opacity-40 hover:-translate-y-1 transition duration-300`} >
                <div className='relative rounded-lg overflow-hidden'>
                  <img img src={movie.poster_path} alt={movie.title || "Movie Poster"} className='w-full object-cover brightness-90'/>
                  <div className='text-sm flex items-center justify-between p-2 bg-black/60 w-full absolute bottom-0 left-0'> 
                    <p className="flex items-center gap-1 text-sm text-gray-400">
          <StarIcon className="w-4 h-4 text-primary fill-primary" />
          {movie.vote_average.toFixed(1)}
        </p>
        <p>
          {kcon(movie.vote_count)}Votes
        </p>
                  </div>

                </div>
                {selectedMovies=== movie.id &&(<div>
                  
                </div>)}
            </div>
          ))}

        </div>

      </div>


    </>


  ):(<Loading/>)
}

export default AddShows