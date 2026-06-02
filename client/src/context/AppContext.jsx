import { createContext, useContext, useEffect, useState } from "react";

import axios from 'axios';
import { useAuth, useUser } from "@clerk/clerk-react";
import {  useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

axios.defaults.baseURL=import.meta.env.VITE_BASE_URL;

export const AppContext = createContext();
export const AppProvider = ({ children })=>{

const navigate = useNavigate();

const [isAdmin, setIsAdmin] = useState(false);

const [shows,setShows]= useState([])
const [favoriteMovies,setFavoriteMovies]= useState([])

const image_base_url = import.meta.env.VITE_TMDB_IMAGE_BASE_URL

//page admin function

const {user} = useUser()
const {getToken} = useAuth()
const location = useLocation()


const fetchIsAdmin = async ()=>{
    try {

        const {data} = await axios.get('/api/admin/is-admin',{headers:
            {Authorization:`Bearer ${await getToken()}`}
        })
        setIsAdmin(data.isAdmin)
        if(!data.isAdmin && location.pathname.startsWith('/admin')){
            navigate('/')
            toast.error('dont you event try too open you are no admin')
        }
        
    } catch (error) {
        console.error(error)
        setIsAdmin(false)
        
    }
}


const fetchShows =async()=>{
    try {

        const {data}= await axios.get('/api/show/all')
        if(data.success){
            setShows(data.shows)

        }else{
            toast.error(data.message)
        }
        
    } catch (error) {
        console.error(error)
        
    }
}

const syncCurrentUser = async()=>{
    try {
        await axios.post('/api/user/sync',{},{
            headers:
            {Authorization:`Bearer ${await getToken()}`}
        })
    } catch (error) {
        console.error(error)
    }
}

const trackUserTime = async(seconds)=>{
    try {
        await axios.post('/api/user/track-time',{seconds},{
            headers:
            {Authorization:`Bearer ${await getToken()}`}
        })
    } catch (error) {
        console.error(error)
    }
}



//fetch fav movies for user 
const fetchFavoriteMovies =async()=>{
    try {

        const {data}= await axios.get('/api/user/favorites',{
            headers:
            {Authorization:`Bearer ${await getToken()}`}
        })


        if(data.success){
            setFavoriteMovies(data.movies)

        }else{
            toast.error(data.message)
        }
        
    } catch (error) {
        console.error(error)
        
    }
}



useEffect(()=>{
    fetchShows()
},[])

useEffect(()=>{
    if(user){
        syncCurrentUser()
        fetchIsAdmin()
        fetchFavoriteMovies()
    }else{
        setIsAdmin(false)
        setFavoriteMovies([])
    }
},[user])

useEffect(()=>{
    if(!user) return;

    const interval = setInterval(()=>{
        if(document.visibilityState === 'visible'){
            trackUserTime(30)
        }
    },30000)

    return ()=> clearInterval(interval)
},[user])



    const value = {
        axios,fetchIsAdmin,user,getToken,navigate,isAdmin,shows,favoriteMovies,fetchFavoriteMovies,image_base_url
    }
    return(
        <AppContext.Provider value={value}>
                { children }

        </AppContext.Provider>
    )
}

export const useAppContext = () => useContext(AppContext)
