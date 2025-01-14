'use client'

import { languages } from '@/common/lang'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import CodeMirror, {
    EditorView,
    Extension,
    keymap,
    ReactCodeMirrorRef,
    ViewUpdate,
} from '@uiw/react-codemirror'
// import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { Button, Select } from 'react-daisyui'
import { useSettingsStore } from './SettingPanel' // 引入 useSettingsStore

const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface CollaborativeEditorProps {
    roomId: string | undefined
}

export default function CollaborativeEditor({
    roomId,
}: CollaborativeEditorProps) {
    const [editorContent, setEditorContent] = useState('')
    const [isReadOnly, setIsReadOnly] = useState(false)
    const [userId, setUserId] = useState<number | null>(null)
    const [editingUser, setEditingUser] = useState<number | null>(null)
    const [isJoined, setIsJoined] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { settings } = useSettingsStore() // 使用 useSettingsStore 获取语言设置
    const [languageExtension, setLanguageExtension] = useState<Extension>(null)
    const socketRef = useRef<Socket>(null)
    const editorRef = useRef<ReactCodeMirrorRef>(null)

    useEffect(() => {
        if (!roomId) {
            setError('Invalid room ID')
            return
        }

        socketRef.current = io(BACKEND_URL)

        socketRef.current.on('connect', () => {
            console.log('Connected to server')
            socketRef.current?.emit('joinRoom', roomId)
        })

        socketRef.current.on('userId', (id: number) => {
            setUserId(id)
            setIsJoined(true)
        })

        socketRef.current.on('roomFull', () => {
            setError('Room is full. Please try another room.')
        })

        socketRef.current.on('initialContent', (content: string) => {
            setEditorContent(content)
        })

        socketRef.current.on('contentChange', (newContent: string) => {
            setEditorContent(newContent)
        })

        socketRef.current.on('setEditingUser', (editingUserId: number) => {
            setEditingUser(editingUserId)
            // setIsReadOnly(editingUserId !== userId)
        })

        return () => {
            socketRef.current?.disconnect()
        }
    }, [roomId, userId])

    useEffect(() => {
        languages
            .find((lang) => lang['name'] === settings.language) // 使用 settings.language
            ?.extension()
            .then((ext) => {
                setLanguageExtension(ext)
            })
    }, [settings.language]) // 依赖 settings.language

    const handleEditorChange = (value: string) => {
        if (roomId && !isReadOnly) {
            setEditorContent(value)
            const lastChar = value.slice(-1)
            socketRef.current?.emit('contentChange', {
                roomId,
                content: value,
                lastChar,
            })
        }
    }

    const requestEditPermission = () => {
        if (roomId) {
            socketRef.current?.emit('requestEditPermission', roomId)
        }
    }

    if (!roomId) {
        return (
            <div className='flex items-center justify-center h-screen'>
                <p className='text-xl text-red-500'>Invalid room ID</p>
            </div>
        )
    }

    if (!isJoined) {
        return (
            <div className='flex items-center justify-center h-screen'>
                <p className='text-xl'>Joining room {roomId}...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className='flex items-center justify-center h-screen'>
                <p className='text-xl text-red-500'>{error}</p>
            </div>
        )
    }

    // 移动光标到末尾
    const setCursorEnd = (viewUpdate: ViewUpdate) => {
        const { state, view } = viewUpdate
        const { head, anchor } = state.selection.main
        const docLength = state.doc.length

        if (head !== docLength || anchor !== docLength) {
            view.dispatch({
                selection: { anchor: docLength, head: docLength },
            })
        }
    }

    const handleUpdate = (viewUpdate: ViewUpdate) => {
        // 强制光标在末尾
        setCursorEnd(viewUpdate)
    }

    const extensions = [
        languageExtension,
        // 禁止粘贴
        EditorView.domEventHandlers({ paste: () => true }),
        // 快捷键仅保留换行
        keymap.of([{ key: 'Enter', run: insertNewlineAndIndent }]),
    ]

    return (
        <div className='w-full h-[600px]' onPaste={(e) => e.preventDefault()}>
            <CodeMirror
                ref={editorRef}
                value={editorContent}
                height='50vh'
                // theme={vscodeDark}
                extensions={extensions}
                onChange={handleEditorChange}
                editable={!isReadOnly}
                basicSetup={{
                    history: false,
                    drawSelection: false,
                    defaultKeymap: false,
                    historyKeymap: false,
                    dropCursor: false,
                    allowMultipleSelections: false,
                    closeBrackets: false,
                    autocompletion: false,
                    rectangularSelection: false,
                    crosshairCursor: false,
                    highlightSelectionMatches: false,
                    closeBracketsKeymap: false,
                    searchKeymap: false,
                    foldKeymap: false,
                    lintKeymap: false,
                    tabSize: 4,
                }}
                onUpdate={handleUpdate}
            />
            <div className='mt-4 flex justify-between items-center'>
                <p>
                    You are User {userId} in Room {roomId}.
                    {isReadOnly
                        ? `User ${editingUser} is currently editing.`
                        : 'You can edit now. Press Enter to switch control.'}
                </p>
                {isReadOnly && (
                    <Button
                        onClick={requestEditPermission}
                        className='px-4 py-2 rounded btn-primary'
                    >
                        Request Edit Permission
                    </Button>
                )}
            </div>
        </div>
    )
}
