import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useDropzone } from 'react-dropzone'
import './App.css'

function useSessionId() {
  const [sessionId, setSessionId] = useState(null)
  useEffect(() => {
    let mounted = true
    async function ensure() {
      try {
        const existing = localStorage.getItem('sessionId')
        if (existing) {
          setSessionId(existing)
          return
        }
        const { data } = await axios.post('/api/sessions', { title: 'New Conversation' })
        if (mounted) {
          localStorage.setItem('sessionId', data.session.sessionId)
          setSessionId(data.session.sessionId)
        }
      } catch (e) {
        console.error(e)
      }
    }
    ensure()
    return () => {
      mounted = false
    }
  }, [])
  return sessionId
}

function App() {
  const sessionId = useSessionId()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState(null)
  const [redacted, setRedacted] = useState(null)
  const [detections, setDetections] = useState([])
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    axios.get(`/api/sessions/${sessionId}/messages`).then(({ data }) => {
      setMessages(data.messages || [])
    })
  }, [sessionId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendText() {
    if (!input.trim() || !sessionId) return
    setLoading(true)
    try {
      const { data } = await axios.post(`/api/sessions/${sessionId}/messages/text`, { message: input })
      setMessages((m) => [...m, data.userMessage, data.assistantMessage])
      setInput('')
    } catch (e) {
      console.error(e)
      alert('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useMemo(
    () =>
      (accepted) => {
        if (!accepted.length || !sessionId) return
        const form = new FormData()
        form.append('image', accepted[0])
        setLoading(true)
        axios
          .post(`/api/sessions/${sessionId}/messages/image`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          .then(({ data }) => {
            setMessages((m) => [...m, data.message])
            setPreview(data.previewImage)
            setRedacted(data.redactedImage)
            setDetections(data.detections)
          })
          .catch((e) => {
            console.error(e)
            alert('Upload failed')
          })
          .finally(() => setLoading(false))
      },
    [sessionId]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] } })

  return (
    <div className="max-w-5xl mx-auto p-4">
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight">PII Redaction Chat</h1>
        <p className="text-sm text-gray-600">Upload images and we will automatically detect and redact PII like emails, phone numbers, names, addresses, credit cards, and dates of birth.</p>
      </header>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg text-center mb-4 p-6 ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white'
          }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-gray-600">
          {isDragActive ? 'Drop image here…' : 'Drag & drop an image, or click to select'}
        </p>
        <p className="text-xs text-gray-400 mt-1">Max 5MB • JPG/PNG/GIF/WebP</p>
      </div>

      <section className="border border-gray-200 rounded-lg p-3 min-h-60 bg-white">
        {messages.map((m) => (
          <div key={m._id || m.createdAt} className={`my-1 flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
            <div className={`${m.role === 'assistant' ? 'bg-gray-100' : 'bg-indigo-600 text-white'} px-3 py-2 rounded-md max-w-[85%]`}>
              <div className="text-[11px] uppercase tracking-wider opacity-70 mb-1">{m.role}</div>
              <div>{m.type === 'text' ? m.content : `[${m.type}] ${m.content}`}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <div className="flex gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          disabled={loading}
          onClick={sendText}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

      {preview && (
        <section className="mt-5">
          <h3 className="text-lg font-medium mb-2">Redaction Preview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Original</p>
              <img src={preview} className="max-w-[400px] border border-gray-200 rounded" />
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Redacted</p>
              <img src={redacted} className="max-w-[400px] border border-gray-200 rounded" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm text-gray-600">Detected items: {detections.length}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {detections.map((d) => (
                <span key={d.id} className="text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200">
                  {d.type}
                </span>
              ))}
            </div>
          </div>
          <button
            className="mt-2 px-4 py-2 rounded-md bg-green-600 text-white"
            onClick={async () => {
              try {
                await axios.post(`/api/sessions/${sessionId}/messages/image/confirm`, {
                  redactedImage: redacted,
                  detections,
                })
                alert('Redaction confirmed')
              } catch (e) {
                console.error(e)
                alert('Failed to confirm')
              }
            }}
          >
            Confirm & Send
          </button>
          <button
            className="mt-2 ml-2 px-4 py-2 rounded-md border border-gray-300"
            onClick={() => {
              const a = document.createElement('a')
              a.href = redacted
              a.download = 'redacted.png'
              a.click()
            }}
          >
            Download Redacted
          </button>
        </section>
      )}
    </div>
  )
}

export default App
