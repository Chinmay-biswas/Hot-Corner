import axios from 'axios';
import Movie from '../models/Movie.js'; 


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
            const {movieID,showsInput,showPrice}=req.body
            let movie= await Movie.findById(movieID)
            if(!movie){
                //fetch movie details and cast details

                const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/movie/${movieID}`,
                        {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`}}),
        
          axios.get(`https://api.themoviedb.org/3/movie/${movieID}/credits`,{
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`}})
        ]);
    
    const movieApiData = movieDetailsResponse.data;
    const movieCreditsData = movieCreditsResponse.data;


    const movieDetails={
        _id:movieID,
    }
    
    }
        
                     

    }catch (error) {
    console.error("Error fetching in Adding show:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
