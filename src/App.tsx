import { useEditor } from './store/editorStore'
import Editor from './components/Editor'
import HomeScreen from './components/HomeScreen'
import ColorScreen from './components/ColorScreen'
import TemplateScreen from './components/TemplateScreen'

export default function App() {
  const screen = useEditor((s) => s.screen)
  if (screen === 'home') return <HomeScreen />
  if (screen === 'templates') return <TemplateScreen />
  if (screen === 'colors') return <ColorScreen />
  return <Editor />
}
