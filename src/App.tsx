import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')   // YYYY-MM-DD
  const [time, setTime] = useState('')   // HH:mm
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

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
      if (error) {
        // Log รายละเอียด error
        console.error(
          'Supabase select error:',
          error.message,
          error.details,
          error.hint
        )
        // แจ้งเตือนผู้ใช้
        alert('เกิดข้อผิดพลาดในการตรวจสอบเวลา')
      }
      // ...existing code...
    }
    fetchData()
  }, [])

  const generateTimeSlots = () => {
    const times: string[] = []
    for (let hour = 8; hour <= 17; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
      times.push(`${hour.toString().padStart(2, '0')}:30`)
    }
    return times
  }

  // รวม date + time → scheduled_at
  const toScheduledAt = (d: string, t: string) => {
    if (!d || !t) return null
    const fullTime = t.length === 5 ? `${t}:00` : t
    return new Date(`${d}T${fullTime}`)
  }

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

      const scheduledAtDate = toScheduledAt(_date, _time)
      if (!scheduledAtDate) {
        alert('เวลาไม่ถูกต้อง')
        return
      }
      const scheduledAt = scheduledAtDate.toISOString()

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      let lineId: string | null = null
      try {
        const profile = await liff.getProfile()
        lineId = profile.userId
      } catch (err) {
        console.warn('LIFF getProfile error:', err)
      }

      // 1) ตรวจว่ามีคิวนี้แล้วหรือยัง
      const { error: checkErr, count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_at', scheduledAt)

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
        {
          patient_name: _name,
          hn: _phone,
          scheduled_at: scheduledAt,
          chief: _symptom,
          // เพิ่ม line_id เองถ้าคุณ ALTER TABLE แล้ว
          line_id: lineId,
        },
      ])

      if (insertErr) {
        console.error('Supabase insert error:', insertErr)
        alert(`เกิดข้อผิดพลาดในการจอง: ${insertErr.message}`)
        return
      }

      // 3) ส่ง Google Apps Script (optional)
      const response = await fetch(
        'https://script.google.com/macros/s/AKfycbxs1LqDpES8OxbzyoDz1as7qDp3qbFj10sLrLESlrpp7A_BewLpnNGgho681OBtvWAm1A/exec',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: _name,
            phone: _phone,
            scheduled_at: scheduledAt,
            symptom: _symptom,
          }),
        }
      )

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Google Apps Script error: ${text || response.status}`)
      }

      // 4) ส่งข้อความยืนยันกลับ LINE
      try {
        await liff.sendMessages([
          {
            type: 'text',
            text: `✅ จองสำเร็จ!\n👤 ชื่อ: ${_name}\n📱 เบอร์: ${_phone}\n📅 เวลา: ${scheduledAtDate.toLocaleString()}\n📋 อาการ: ${_symptom}`,
          },
        ])
      } catch (err) {
        console.warn('sendMessages failed:', err)
      }

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
