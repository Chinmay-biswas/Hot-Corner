import axios from 'axios';
import Movie from '../models/Movie.js'; 
import Show from '../models/Show.js';
import Booking from '../models/Booking.js';
import ReleaseVote from '../models/ReleaseVote.js';
import User from '../models/User.js';
import sendEmail from '../configs/nodemailer.js';
import { autoCreateDailyShows } from '../services/autoShowService.js';

const tmdbHeaders = () => ({
  accept: 'application/json',
  Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
});

const TMDB_REQUEST_TIMEOUT_MS = 15000;
const TMDB_MAX_RETRIES = 2;
const TMDB_RETRY_DELAY_MS = 700;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableTmdbError = (error) => {
  const status = error.response?.status;
  const retryableCodes = ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'];

  return retryableCodes.includes(error.code)
    || status === 429
    || (status >= 500 && status < 600);
};

const getSafeErrorDetails = (error) => {
  if (!error.isAxiosError) return error;

  return {
    message: error.message,
    code: error.code,
    status: error.response?.status,
    method: error.config?.method,
    url: error.config?.url,
  };
};

const getPublicTmdbMessage = (error) => {
  if (error.response?.status === 401) {
    return 'Movie data service is not configured correctly.';
  }

  if (error.response?.status === 429) {
    return 'Movie data service is busy. Please try again shortly.';
  }

  if (isRetryableTmdbError(error)) {
    return 'Movie data service is temporarily unavailable. Please try again.';
  }

  return error.message;
};

const sendControllerError = (res, label, error) => {
  console.error(label, getSafeErrorDetails(error));

  if (error.isAxiosError) {
    const status = error.response?.status === 401 ? 502 : 503;
    return res.status(status).json({
      success: false,
      message: getPublicTmdbMessage(error),
    });
  }

  return res.status(500).json({ success: false, message: error.message });
};

const fetchTmdb = async (url, options = {}) => {
  const { retries = TMDB_MAX_RETRIES, headers, ...axiosOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await axios.get(url, {
        ...axiosOptions,
        headers: { ...tmdbHeaders(), ...headers },
        timeout: axiosOptions.timeout ?? TMDB_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      const shouldRetry = attempt < retries && isRetryableTmdbError(error);

      if (!shouldRetry) {
        throw error;
      }

      await sleep(TMDB_RETRY_DELAY_MS * (attempt + 1));
    }
  }
};

const buildMovieDetailsFromTmdb = (movieApiData, movieCreditsData = { cast: [] }) => ({
  _id: movieApiData.id?.toString(),
  title: movieApiData.title || movieApiData.original_title || 'Untitled Movie',
  overview: movieApiData.overview || 'No overview available.',
  poster_path: movieApiData.poster_path || '',
  backdrop_path: movieApiData.backdrop_path || movieApiData.poster_path || '',
  original_language: movieApiData.original_language || '',
  genres: movieApiData.genres || [],
  casts: (movieCreditsData.cast || []).slice(0, 20).map((cast) => ({
    id: cast.id,
    name: cast.name,
    character: cast.character,
    profile_path: cast.profile_path,
    gender: cast.gender,
    order: cast.order,
  })),
  vote_average: movieApiData.vote_average || 0,
  runtime: movieApiData.runtime || 0,
  tagline: movieApiData.tagline || '',
});

const getMovieTrailerUrl = async (movieId) => {
  try {
    const { data } = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}/videos?language=en-US`);
    const video = data.results.find(
      (item) => item.site === 'YouTube' && item.type === 'Trailer'
    ) || data.results.find(
      (item) => item.site === 'YouTube' && item.type === 'Teaser'
    );

    return video ? `https://www.youtube.com/watch?v=${video.key}` : '';
  } catch (error) {
    console.error(`Could not fetch trailer for ${movieId}:`, error.message);
    return '';
  }
};

const getTmdbMovieDetails = async (movieId) => {
  const movieDetailsResponse = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}`);
  const movieCreditsResponse = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`)
    .catch(() => ({ data: { cast: [] } }));

  return buildMovieDetailsFromTmdb(movieDetailsResponse.data, movieCreditsResponse.data);
};


// api to get now playing movies from dmdb api
export const getNowPlayingMovies = async (req, res) => {
  try {
    const { data } = await fetchTmdb('https://api.themoviedb.org/3/movie/now_playing');

    const movies = data.results;
    res.json({ success: true, movies });
  } catch (error) {
    sendControllerError(res, "Error fetching now playing movies:", error);
  }
};

export const getReleases = async (req, res) => {
  try {
    const { data } = await fetchTmdb('https://api.themoviedb.org/3/movie/now_playing');

    const movieIds = data.results.map((movie) => movie.id.toString());
    const votes = await ReleaseVote.find({ movieId: { $in: movieIds } });
    const votesMap = new Map(votes.map((vote) => [vote.movieId, vote.voters]));
    const auth = req.auth?.();
    const userId = auth?.userId;

    const movies = data.results
      .map((movie, index) => {
        const voters = votesMap.get(movie.id.toString()) || [];
        return {
          ...movie,
          voteRank: index,
          upvotes: voters.length,
          isUpvoted: userId ? voters.includes(userId) : false,
        };
      })
      .sort((a, b) => b.upvotes - a.upvotes || a.voteRank - b.voteRank);

    res.json({ success: true, movies });
  } catch (error) {
    sendControllerError(res, "Error fetching releases:", error);
  }
};

export const getUpcomingTrailers = async (req, res) => {
  try {
    const { data } = await fetchTmdb('https://api.themoviedb.org/3/movie/upcoming');

    const moviesWithVideos = await Promise.all(
      data.results.slice(0, 12).map(async (movie) => {
        try {
          const { data: videoData } = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movie.id}/videos`);

          const video = videoData.results.find(
            (item) => item.site === 'YouTube' && item.type === 'Trailer'
          ) || videoData.results.find(
            (item) => item.site === 'YouTube' && item.type === 'Teaser'
          );

          if (!video) return null;

          return {
            id: movie.id,
            title: movie.title,
            image: `https://img.youtube.com/vi/${video.key}/maxresdefault.jpg`,
            videoUrl: `https://www.youtube.com/watch?v=${video.key}`,
          };
        } catch (error) {
          console.error(`Error fetching videos for ${movie.id}:`, error.message);
          return null;
        }
      })
    );

    const trailers = moviesWithVideos.filter(Boolean).slice(0, 4);

    res.json({ success: true, trailers });
  } catch (error) {
    sendControllerError(res, "Error fetching upcoming trailers:", error);
  }
};

export const toggleReleaseUpvote = async (req, res) => {
  try {
    const userId = req.auth().userId;
    const { movieId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please login to upvote" });
    }

    if (!movieId) {
      return res.status(400).json({ success: false, message: "Movie id is required" });
    }

    const releaseVote = await ReleaseVote.findOneAndUpdate(
      { movieId: movieId.toString() },
      { $setOnInsert: { movieId: movieId.toString() } },
      { new: true, upsert: true }
    );

    const hasUpvoted = releaseVote.voters.includes(userId);
    releaseVote.voters = hasUpvoted
      ? releaseVote.voters.filter((voterId) => voterId !== userId)
      : [...releaseVote.voters, userId];

    await releaseVote.save();

    res.json({
      success: true,
      upvotes: releaseVote.voters.length,
      isUpvoted: !hasUpvoted,
    });
  } catch (error) {
    console.error("Error updating release upvote:", error);
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

                const movieDetailsResponse = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}`);
                const movieCreditsResponse = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`)
                  .catch((error) => {
                    console.error(`Could not fetch cast for movie ${movieId}:`, error.message);
                    return { data: { cast: [] } };
                  });
    
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

    const users = await User.find({ email: { $exists: true, $ne: "" } }).select("name email");
    const uniqueEmails = [...new Map(users.map((user) => [user.email, user])).values()];
    const showDates = showsInput
      .map((show) => `${show.date} at ${show.time.join(", ")}`)
      .join("<br/>");

    const emailResults = await Promise.allSettled(
      uniqueEmails.map((user) =>
        sendEmail({
          to: user.email,
          subject: `New movie added at Hot Corner: ${movie.title}`,
          body: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
              <h2 style="color: #F84565;">Hi ${user.name || "Movie Fan"},</h2>
              <p>Hot Corner has added a new movie for booking.</p>
              <p><strong>Movie:</strong> ${movie.title}</p>
              <p><strong>Ticket Price:</strong> ${showPrice}</p>
              <p><strong>Show Time:</strong><br/>${showDates}</p>
              <p>Book your seat before it fills up.</p>
              <p>Greetings from,<br/><strong>Hot Corner</strong></p>
            </div>
          `,
        })
      )
    );
    const sentEmails = emailResults.reduce(
      (count, result) => count + (result.status === "fulfilled" ? result.value.accepted?.length || 0 : 0),
      0
    );
    const failedEmails = emailResults.reduce(
      (count, result) => count + (result.status === "fulfilled" ? result.value.rejected?.length || 0 : 1),
      0
    );
    if (failedEmails > 0) {
      console.error(`Failed to send ${failedEmails} new movie email(s)`);
    }

    res.json({success:true,message:`show added sucessfully. Emails sent: ${sentEmails}, failed: ${failedEmails}`})
        
                     

    }catch (error) {
    sendControllerError(res, "Error adding show:", error);
  }
};

export const deleteShow = async (req,res)=>{
    try {
        const {showId}=req.params;
        const show = await Show.findById(showId);

        if(!show){
            return res.status(404).json({success:false,message:'Show not found'})
        }

        await Booking.deleteMany({show:showId});
        await Show.findByIdAndDelete(showId);

        res.json({success:true,message:'show deleted successfully'})
    } catch (error) {
        console.error("Error deleting show:", error);
        res.status(500).json({success:false,message:error.message})
    }
}

export const autoAddDailyShows = async (req, res) => {
    try {
        const result = await autoCreateDailyShows();
        res.json({
            success: true,
            message: 'Automatic daily shows created successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error creating automatic daily shows:', {
            message: error.message,
            code: error.code,
            status: error.response?.status,
        });
        res.status(500).json({ success: false, message: error.message });
    }
}


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
        let movie = await Movie.findById(movieId);
        const dateTime = {};

        show.forEach((show)=> {
            const date = show.showDateTime.toISOString().split("T")[0];
            if(!dateTime[date]){
                dateTime[date]=[]
            }
            dateTime[date].push({time: show.showDateTime,showId: show._id})
        })

        if (!movie) {
            movie = await getTmdbMovieDetails(movieId);
        }

        const trailerUrl = await getMovieTrailerUrl(movieId);

        res.json({
            success: true,
            movie,
            dateTime,
            trailerUrl,
            hasShows: Object.keys(dateTime).length > 0,
        })



    } catch (error) {
        if (error.isAxiosError) {
            return sendControllerError(res, "Error fetching movie details:", error);
        }

        console.error(error);
        res.status(404).json({success:false,message:'Movie details not found'})
        
        
    }
}
