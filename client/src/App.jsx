import React from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Movies from './pages/Movies'
import MovieDetails from './pages/MovieDetails'
import Seatlayout from './pages/Seatlayout'
import MyBookings from './pages/MyBookings'
import Favorites from './pages/Favorites'
import {Toaster} from 'react-hot-toast'
import Footer from './components/Footer'
import Dashboard from './pages/admin/Dashboard'
import Layout from './pages/admin/Layout'
import ListBookings from './pages/admin/ListBookings'
import ListShows from './pages/admin/ListShows'
import AddShows from './pages/admin/AddShows'









const App = () => {
const isAdminRoute = useLocation().pathname.startsWith('/admin');

  return (
    <>
    <Toaster/>
      {!isAdminRoute && <Navbar/>}
      <Routes>
        <Route path='/' element={<Home/>}/>
        <Route path='/movies' element={<Movies/>}/>
        <Route path='/movies/:id' element={<MovieDetails/>}/>
        <Route path='/movies/:id/:date' element={<Seatlayout/>}/> 
        <Route path='/my-bookings' element={<MyBookings/>}/> 
        <Route path='/favorites' element={<Favorites/>}/>
        <Route path='/admin/*' element={<Layout/>}>
          <Route index element={<Dashboard/>}/>
          <Route path="add-shows" element={<AddShows/>}/>
          <Route path="list-shows" element={<ListShows/>}/>
          <Route path="list-bookings" element={<ListBookings/>}/>

        </Route>

        </Routes>
       {!isAdminRoute && <Footer/>} 
    </>
  )
}

export default App