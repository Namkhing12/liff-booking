import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { initLiff } from './liffInit'
import liff from '@line/liff'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')      // YYYY-MM-DD
  const [time, setTime] = useState('')      // HH:mm (ui)
  const [symptom, setSymptom] = useState('')
  const [loading, setLoading] = useState(false)

  // รอ init LIFF ให้เสร็จก่อน
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

  // แปลงเวลาให้เข้ากับคอลัมน์ TIME ของ Postgres (HH:mm:ss)
  const toDbTime = (t: string) => (t && t.length === 5 ? `${t}:00` : t)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    try {
      // trim ค่าก่อนใช้
      const _name = name.trim()
      const _phone = phone.trim()
      const _date = date.trim()
      const _time = toDbTime(time.trim())
      const _symptom = symptom.trim()

      if (!_name || !_phone || !_date || !_time || !_symptom) {
        alert('กรุณากรอกข้อมูลให้ครบ')
        return
      }

      // ให้แน่ใจว่าอยู่ในสถานะล็อกอิน
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      let lineId = ''
      try {
        const profile = await liff.getProfile()
        lineId = profile.userId
      } catch (err) {
        console.error('LIFF getProfile error:', err)
        // ยังให้จองได้ แต่แจ้งเตือน
        alert('ไม่สามารถดึงโปรไฟล์ LINE ได้ (จะจองต่อโดยไม่ผูก LINE ID)')
      }

      // 1) ตรวจเวลาซ้ำ (count + head)
      const { error: checkErr, count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('date', _date)     // ถ้า column เป็น DATE
        .eq('time', _time)     // ถ้า column เป็น TIME → ต้อง HH:mm:ss

      if (checkErr) {
        // แสดงข้อความจริงจาก PostgREST
        const msg = (checkErr as any)?.message || JSON.stringify(checkErr)
        console.error('Supabase select error:', checkErr)
        alert(`ตรวจสอบเวลาล้มเหลว: ${msg}`)
        return
      }

      if ((count ?? 0) > 0) {
        alert('⛔ เต็มแล้ว กรุณาเลือกเวลาอื่น')
        return
      }

      // 2) Insert
      const { error: insertErr } = await supabase.from('appointments').insert([
        { name: _name, phone: _phone, date: _date, time: _time, symptom: _symptom, line_id: lineId || null },
      ])

      if (insertErr) {
        const code = (insertErr as any)?.code
        if (code === '23505') {
          // unique(date,time)
          alert('⛔ เวลาโดนจองพอดี กรุณาเลือกเวลาอื่น')
          return
        }
        const msg = (insertErr as any)?.message || JSON.stringify(insertErr)
        console.error('Supabase insert error:', insertErr)
        alert(`เกิดข้อผิดพลาดในการจอง: ${msg}`)
        return
      }

      // 3) ยิง Google Apps Script
      const response = await fetch(
        'https://script.google.com/macros/s/AKfycbxs1LqDpES8OxbzyoDz1as7qDp3qbFj10sLrLESlrpp7A_BewLpnNGgho681OBtvWAm1A/exec',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: _name, date: _date, time: _time, symptom: _symptom }),
        }
      )

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Google Apps Script error: ${text || response.status}`)
      }

      // 4) ส่งข้อความยืนยัน LINE + ปิดหน้าต่าง
      try {
        await liff.sendMessages([
          {
            type: 'text',
            text: `✅ จองสำเร็จ!\n👤 ชื่อ: ${_name}\n📅 วันที่: ${_date}\n🕒 เวลา: ${time}\n📋 อาการ: ${_symptom}`,
          },
        ])
      } catch (err) {
        console.warn('sendMessages failed (ไม่วิกฤต):', err)
      }
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
