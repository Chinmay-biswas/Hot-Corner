import React from 'react'
import {
  LayoutDashboardIcon,
  PlusSquareIcon,
  ListIcon,
  ListCollapseIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { assets } from '../../assets/assets'

const AdminSidebar = () => {


    const user={
        firstName:'admin',
        lastName:'user',
        imageUrl: assets.profile,
    }

     const adminNavlinks = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboardIcon },
  { name: 'Add Shows', path: '/admin/add-shows', icon: PlusSquareIcon },
  { name: 'List Shows', path: '/admin/list-shows', icon: ListIcon },
  { name: 'List Bookings', path: '/admin/list-bookings', icon: ListCollapseIcon },
]  


  return (
    <div className='h-[calc(100vh-64px)] md:flex flex-col items-center  pt-8 max-w-10 md:max-w-60 w-full border-r border-primary-dull/20 text-lg'>
            <img className='h-9md:h-14 w-9 md:w-14 rounded-full mx-auto' src={user.imageUrl} alt="sidebar"/>
            <p className='mt-2 text-base max-md:hidden'>{user.firstName}{user.lastName}</p>

            <div className='w-full gap-6'>
                {adminNavlinks.map((link, index)=>(
                    <NavLink key={index} to={link.path} end className={({isActive})=>`relative flex items-center max-md:justify-center gap-6 w-full py-2.5 min-md:pl-10 first:mt-6 text-gray-400 ${!isActive && 'hover:bg-primary/10'} ${isActive && 'bg-primary/20 text-primary group'}`}>
                        {({isActive})=>(
                            <>
                                <link.icon className='w-5 h-5'/>
                                <p className='max-md:hidden'>{link.name}</p>
                                <span className={`w-1.5 h-10 rounded-1 right-0 absolute ${isActive && 'bg-primary'}`}/>
                            </>
                        )}

                    </NavLink>
                ))}

            </div>
        
    </div>
  )
}

export default AdminSidebar