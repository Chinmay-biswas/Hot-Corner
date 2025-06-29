import axios from 'axios';
import Movie from '../models/Movie.js'; 
import Show from '../models/Show.js';


// api to get now playing movies from dmdb api
export const getNowPlayingMovies = async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://api.themoviedb.org/3/movie/now_playing',
      {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        },
      }
    );

    const movies = data.results;
    res.json({ success: true, movies });
  } catch (error) {
    console.error("Error fetching now playing movies:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};



// api to add a new show to the data base
export const addShow=async(req,res)=>{
    try{
            const {movieId,showsInput,showPrice}=req.body
            let movie= await Movie.findById(movieId)
            if(!movie){
                //fetch movie details and cast details

                const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/movie/${movieId}`,
                        {
        headers: {accept: 'application/json',
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`}}),
        
          axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`,{
        headers: {
            accept: 'application/json',
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`}})
        ]);
    
    const movieApiData = movieDetailsResponse.data;
    const movieCreditsData = movieCreditsResponse.data;
    const filteredCasts = movieCreditsData.cast.map(c => ({
  id: c.id,
  name: c.name,
  character: c.character,
  profile_path: c.profile_path,
  gender: c.gender,
  order: c.order
}));
console.log("Filtered cast:", filteredCasts.length, filteredCasts[0]);




    const movieDetails={
        _id:movieId,
        title:movieApiData.title ,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        original_language: movieApiData.original_language,
        release_date:movieApiData.release_date,
        genres: movieApiData.genres,
        casts: filteredCasts,
        vote_average:movieApiData.vote_average ,
        runtime: movieApiData.runtime,
        tagline: movieApiData.tagline || "",

    } //add this in mongo db data base


    movie = await Movie.create(movieDetails);
    
    }

    const showsToCreate =[];
    showsInput.forEach(show=>{
        const showDate = show.date;
        show.time.forEach((time)=>{
            const dateTimeString = `${showDate}T${time}`;
            showsToCreate.push({
                movie: movieId,
                showDateTime : new Date(dateTimeString),
                showPrice,
                occupiedSeats:{}

            })
        })
    });


    if(showsToCreate.length>0){
        await Show.insertMany(showsToCreate);
    }

    res.json({success:true,message:'show added sucessfully'})
        
                     

    }catch (error) {
    console.error("Error fetching in Adding show:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// api to get all show from the datatbases 
export const getShows = async(req,res)=>{
    try {
        const shows =await Show.find({showDateTime:{$gte:new Date()}}).populate('movie').sort({ showDateTime: 1});



//filter the unique shows

const uniqueShowsMap = new Map();

// Use movie._id as the key to ensure uniqueness
shows.forEach(show => {
  const movieId = show.movie._id.toString();
  if (!uniqueShowsMap.has(movieId)) {
    uniqueShowsMap.set(movieId, show.movie);
  }
});

res.json({ success: true, shows: Array.from(uniqueShowsMap.values()) });

    } catch (error) {
        console.error(error);
        res.json({success:false,message:error.message})
        
    }
}


//api to get single show only from the data base

export const getShow = async(req,res)=>{
    try {
        const{movieId}=req.params;
        //get all upcoming shows for the movie 

            const show = await Show.find({movie:movieId, showDateTime:{$gte:new Date()}})
            const movie = await Movie.findById(movieId);
            const dateTime = {};
            show.forEach((show)=> {
                const date = show.showDateTime.toISOString().split("T")[0];
                if(!dateTime[date]){
                    dateTime[date]=[]
                }
                dateTime[date].push({time: show.showDateTime,showID: show._id})
            })

            res.json({success: true, movie,dateTime})



    } catch (error) {
        console.error(error);
        res.json({success:false,message:error.message})
        
        
    }
}