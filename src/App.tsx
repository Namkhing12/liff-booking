import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')      // 'YYYY-MM-DD'
  const [time, setTime] = useState('')      // 'HH:mm'
  const [symptom, setSymptom] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    initLiff()
  }, [])

  const generateTimeSlots = () => {
    const times: string[] = []
    for (let hour = 8; hour <= 17; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
      times.push(`${hour.toString().padStart(2, '0')}:30`)
    }
    return times
  }

  // ถ้าคอลัมน์ time ใน DB เป็น type TIME ให้แปลงเป็น HH:mm:ss
  const toDbTime = (t: string) => (t.length === 5 ? `${t}:00` : t)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    try {
      // ต้องมั่นใจว่า login แล้ว
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }
      const profile = await liff.getProfile()
      const lineId = profile.userId

      const dbTime = toDbTime(time)

      // 1) ตรวจว่ามีคิวเวลานี้แล้วหรือยัง (ใช้ head:true ประหยัดทรัพยากร)
      const { error: checkErr, count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .eq('time', dbTime)

      if (checkErr) {
        console.error('Supabase select error:', checkErr)
        alert(`ตรวจสอบเวลาล้มเหลว: ${checkErr.message}`)
        return
      }
      if ((count ?? 0) > 0) {
        alert('⛔ เต็มแล้ว กรุณาเลือกเวลาอื่น')
        return
      }

      // 2) Insert
      const { error: insertErr } = await supabase.from('appointments').insert([
        { name, phone, date, time: dbTime, symptom, line_id: lineId },
      ])

      if (insertErr) {
        // ชน unique constraint (ถ้าตั้งใน DB)
        if ((insertErr as any).code === '23505') {
          alert('⛔ เวลาโดนจองพอดี กรุณาเลือกเวลาอื่น')
          return
        }
        console.error('Supabase insert error:', insertErr)
        alert(`เกิดข้อผิดพลาดในการจอง: ${insertErr.message}`)
        return
      }

      // 3) จอง Google Calendar ผ่าน GAS
      const response = await fetch(
        'https://script.google.com/macros/s/AKfycbxs1LqDpES8OxbzyoDz1as7qDp3qbFj10sLrLESlrpp7A_BewLpnNGgho681OBtvWAm1A/exec',
        {
          method: 'POST',
          body: JSON.stringify({ name, date, time: dbTime, symptom }),
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Google Apps Script error: ${text || response.status}`)
      }

      // 4) ส่งข้อความยืนยันกลับ LINE แล้วปิดหน้าต่าง
      await liff.sendMessages([
        {
          type: 'text',
          text: `✅ จองสำเร็จ!\n👤 ชื่อ: ${name}\n📅 วันที่: ${date}\n🕒 เวลา: ${time}\n📋 อาการ: ${symptom}`,
        },
      ])
      liff.closeWindow()
    } catch (err: any) {
      console.error(err)
      alert(`เกิดข้อผิดพลาด: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`)
    } finally {
      setLoading(false)
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
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              pattern="[0-9]*"
              inputMode="numeric"
              required
            />
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
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>💬 อาการเบื้องต้น:</label>
            <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} required />
          </div>

          <button className="btn-submit" type="submit" disabled={loading}>
            {loading ? 'กำลังจอง…' : 'ยืนยันการจอง'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
