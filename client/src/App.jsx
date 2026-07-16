import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import CounselingSession from './CounselingSession'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const socket = io('http://localhost:5000')

    socket.on('connect', () => {
      console.log('Connected to server via Socket.IO')
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return <CounselingSession bookingId={4} name="Joan Aballe" role="resident" />
}

export default App
