import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [symptom, setSymptom] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        await initLiff()
        if (!liff.isLoggedIn()) {
          liff.login()
        }
      } catch (err) {
        console.error('LIFF init error:', err)
        alert('ไม่สามารถเริ่ม LIFF ได้')
      }
    })()
  }, [])

  const generateTimeSlots = () => {
    const times: string[] = []
    for (let hour = 8; hour <= 17; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
      times.push(`${hour.toString().padStart(2, '0')}:30`)
    }
    return times
  }

  // แปลง "11:00" -> "11:00:00"
  const toDbTime = (t: string) => (t && t.length === 5 ? `${t}:00` : t)

  // รวม date + time -> ISO string สำหรับ scheduled_at
  const toScheduledAt = (d: string, t: string) => `${d}T${toDbTime(t)}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    try {
      const _name = name.trim()
      const _phone = phone.trim()
      const _date = date.trim()
      const _time = time.trim()
      const _symptom = symptom.trim()

      if (!_name || !_phone || !_date || !_time || !_symptom) {
        alert('กรุณากรอกข้อมูลให้ครบ')
        return
      }

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      try {
        await liff.getProfile()
      } catch (err) {
        console.error('LIFF getProfile error:', err)
      }

      const scheduledAt = toScheduledAt(_date, _time) // e.g. 2025-09-05T11:00:00

      // 1) ตรวจสอบเวลาซ้ำ
      const { count, error: checkErr } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_at', scheduledAt)

      if (checkErr) {
        console.error('Supabase select error:', checkErr)
        alert(`ตรวจสอบเวลาล้มเหลว: ${checkErr.message || 'ไม่ทราบสาเหตุ'}`)
        return
      }
      if ((count ?? 0) > 0) {
        alert('⛔ เต็มแล้ว กรุณาเลือกเวลาอื่น')
        return
      }

      // 2) insert (ใช้คอลัมน์ที่มีจริง)
      const { error: insertErr } = await supabase.from('appointments').insert([
        {
          patient_name: _name,
          scheduled_at: scheduledAt,
          chief_complaint: _symptom,
          // ถ้าจะเก็บ phone ใน DB ให้เพิ่ม column ก่อน แล้วใส่ตรงนี้ได้เลย
          // phone: _phone,
        },
      ])

      if (insertErr) {
        console.error('Supabase insert error:', insertErr)
        if ((insertErr as any).code === '23505') {
          alert('⛔ เวลาโดนจองพอดี กรุณาเลือกเวลาอื่น')
        } else {
          alert(`เกิดข้อผิดพลาดในการจอง: ${insertErr.message || ''}`)
        }
        return
      }

      // 3) ส่งข้อมูลไป Google Apps Script
      const response = await fetch(
        'https://script.google.com/macros/s/AKfycbxs1LqDpES8OxbzyoDz1as7qDp3qbFj10sLrLESlrpp7A_BewLpnNGgho681OBtvWAm1A/exec',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: _name,
            phone: _phone,
            date: _date,
            time: toDbTime(_time),
            symptom: _symptom,
          }),
        }
      )

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Google Apps Script error: ${text || response.status}`)
      }

      // ✅ แจ้งผู้ใช้ในหน้านี้ (แทนส่ง LINE)
      alert(
        `✅ จองสำเร็จ!\n👤 ชื่อ: ${_name}\n📅 วันที่: ${_date}\n🕒 เวลา: ${_time}\n📋 อาการ: ${_symptom}`
      )

      liff.closeWindow()
    } catch (err: any) {
      console.error('Unexpected error:', err)
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>🕒 เวลา:</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            >
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
            <textarea
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              required
            />
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
