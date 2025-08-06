import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [idCard, setIdCard] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [symptom, setSymptom] = useState('')

  useEffect(() => {
    initLiff()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const profile = await liff.getProfile()
    const lineId = profile.userId

    const { error } = await supabase.from('appointments').insert([
      {
        name,
        id_card: idCard || null,
        phone: phone || null,
        date,
        time,
        symptom,
        line_id: lineId,
      },
    ])

    if (!error) {
      await liff.sendMessages([
        {
          type: 'text',
          text: `✅ จองสำเร็จ\n👤 ชื่อ: ${name}\n📅 วันที่: ${date}\n🕒 เวลา: ${time}\n📋 อาการ: ${symptom}`,
        },
      ])
      liff.closeWindow()
    } else {
      alert('เกิดข้อผิดพลาดในการจองคิว')
    }
  }

  return (
    <div className="booking-container">
      <div className="form-card">
        <h2>🩺 จองคิวเข้าพบแพทย์</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>👤 ชื่อ-นามสกุล:</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>🆔 เลขบัตรประชาชน (ไม่บังคับ):</label>
            <input value={idCard} onChange={(e) => setIdCard(e.target.value)} />
          </div>
          <div className="form-group">
            <label>📱 เบอร์โทร (ไม่บังคับ):</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>📅 วันที่ต้องการเข้ารับบริการ:</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>🕒 เวลา:</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>💬 อาการเบื้องต้น:</label>
            <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} required />
          </div>
          <button className="btn-submit" type="submit">✅ ยืนยันการจอง</button>
        </form>
      </div>
    </div>
  )
}

export default App
