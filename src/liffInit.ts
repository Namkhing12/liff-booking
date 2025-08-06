import liff from '@line/liff'

export const initLiff = async () => {
  try {
    await liff.init({ liffId: import.meta.env.VITE_LIFF_ID })

    // ไม่ต้อง login ถ้าเปิดจากในแชท LINE
    if (!liff.isLoggedIn() && !liff.isInClient()) {
      liff.login()
    }

  } catch (err) {
    console.error('LIFF init error:', err)
  }
}
