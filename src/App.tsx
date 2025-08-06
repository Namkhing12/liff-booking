import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [symptom, setSymptom] = useState('')

  useEffect(() => {
    initLiff()
  }, [])

  const generateTimeSlots = () => {
    const times = []
    for (let hour = 8; hour <= 17; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
      times.push(`${hour.toString().padStart(2, '0')}:30`)
    }
    return times
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const profile = await liff.getProfile()
    const lineId = profile.userId

    // ตรวจสอบว่าคิวนั้นถูกจองไปหรือยัง
    const { data: existing, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', date)
      .eq('time', time)

    if (fetchError) {
      alert('เกิดข้อผิดพลาดในการตรวจสอบเวลา')
      return
    }

    if (existing && existing.length > 0) {
      alert('⛔ เต็มแล้ว กรุณาเลือกเวลาอื่น')
      return
    }

    // บันทึกลง Supabase
    const { error } = await supabase.from('appointments').insert([
      {
        name,
        phone,
        date,
        time,
        symptom,
        line_id: lineId,
      },
    ])

    // เรียก Google Apps Script เพื่อจอง Google Calendar
    const response = await fetch('https://script.google.com/macros/s/AKfycbxs1LqDpES8OxbzyoDz1as7qDp3qbFj10sLrLESlrpp7A_BewLpnNGgho681OBtvWAm1A/exec', {
      method: 'POST',
      body: JSON.stringify({ name, date, time, symptom }),
      headers: { 'Content-Type': 'application/json' },
    })

    if (!error && response.ok) {
      await liff.sendMessages([
        {
          type: 'text',
          text: `✅ จองสำเร็จ!\n👤 ชื่อ: ${name}\n📅 วันที่: ${date}\n🕒 เวลา: ${time}\n📋 อาการ: ${symptom}`,
        },
      ])
      liff.closeWindow()
    } else {
      alert('เกิดข้อผิดพลาดในการจอง')
    }
  }

  return (
    <div className="booking-container">
      <div className="form-card">
        <h2>จองคิวเข้าพบแพทย์</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>👤 ชื่อ-นามสกุล:</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>📱 เบอร์โทร:</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>📅 วันที่:</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>🕒 เวลา:</label>
            <select value={time} onChange={(e) => setTime(e.target.value)} required>
              <option value="">-- เลือกเวลา --</option>
              {generateTimeSlots().map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>💬 อาการเบื้องต้น:</label>
            <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} required />
          </div>
          <button className="btn-submit" type="submit">ยืนยันการจอง</button>
        </form>
      </div>
    </div>
  )
}

export default App
