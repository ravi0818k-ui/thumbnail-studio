import { useEditor } from './store/editorStore'
import Editor from './components/Editor'
import HomeScreen from './components/HomeScreen'
import ColorScreen from './components/ColorScreen'
import FontScreen from './components/FontScreen'
import FundamentalsScreen from './components/FundamentalsScreen'
import TemplateScreen from './components/TemplateScreen'
import GreenScreen from './components/GreenScreen'
import MobileNotice from './components/MobileNotice'

export default function App() {
  const screen = useEditor((s) => s.screen)
  // The green screen is meant to be propped up on a phone or tablet, so it is the one screen that never warns.
  return (
    <>
      <Screen />
      {screen !== 'greenscreen' && <MobileNotice />}
    </>
  )
}

function Screen() {
  const screen = useEditor((s) => s.screen)
  if (screen === 'home') return <HomeScreen />
  if (screen === 'templates') return <TemplateScreen />
  if (screen === 'colors') return <ColorScreen />
  if (screen === 'fonts') return <FontScreen />
  if (screen === 'fundamentals') return <FundamentalsScreen />
  if (screen === 'greenscreen') return <GreenScreen />
  return <Editor />
}
