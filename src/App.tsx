import { useEditor } from './store/editorStore'
import Editor from './components/Editor'
import HomeScreen from './components/HomeScreen'
import ColorScreen from './components/ColorScreen'
import FontScreen from './components/FontScreen'
import FundamentalsScreen from './components/FundamentalsScreen'
import TemplateScreen from './components/TemplateScreen'
import GreenScreen from './components/GreenScreen'
import MobileNotice from './components/MobileNotice'
import BgRemoverScreen from './components/BgRemoverScreen'
import TutorialsScreen from './components/TutorialsScreen'
import ThumbnailGrabberScreen from './components/ThumbnailGrabberScreen'
import LinkedInScreen from './components/LinkedInScreen'
import { useRouteSync } from './hooks'

export default function App() {
  const screen = useEditor((s) => s.screen)
  useRouteSync()
  // The green screen is meant to be propped up on a phone or tablet, and the tutorials, the downloader
  // and the LinkedIn landing page are a single column, so none of them warns.
  const quiet: string[] = ['greenscreen', 'tutorials', 'grabber', 'linkedin']
  return (
    <>
      <Screen />
      {!quiet.includes(screen) && <MobileNotice />}
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
  if (screen === 'remover') return <BgRemoverScreen />
  if (screen === 'tutorials') return <TutorialsScreen />
  if (screen === 'grabber') return <ThumbnailGrabberScreen />
  if (screen === 'linkedin') return <LinkedInScreen />
  return <Editor />
}
