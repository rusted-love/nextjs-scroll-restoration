import {useEffect, useRef,} from "react"
import {getScrollFromState, getScrollTimestamp, HistoryState, ScrollPos, setCurrentScrollHistory} from "./storage"

const getWindowScroll = (): ScrollPos => [window.scrollX, window.scrollY]
const memoizationIntervalLimit = 300 as const
const scrollRestorationThreshold = 500 as const

//
const navThroughHistoryKey = `revotale_scroll_restorer_is_nav_through_history`

const isNavigatingThroughHistory = (state: HistoryState) => state ? Boolean(state[navThroughHistoryKey]) : false
const useScrollRestorer = (): void => {


    /**
     * This is important to run as late as possible after navigation.
     * We could use something like `setTimeout(restoreCurrentScroll,500)`, but this is not a reactive approach.
     * useLayoutEffect + usePageHref hook is the latest reactive thing Next.js app can provide to use.
     * In Safari even with `window.history.scrollRestoration = 'manual'` scroll position is reset.
     */
    const lastNavigationTime = useRef<Date>(new Date())
    const scrollMemoTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
    useEffect(() => {
        window.history.scrollRestoration = 'manual'


        const resetContextAfterNav = () => {
            lastNavigationTime.current = new Date()
            cancelDelayedScrollMemoization()
        }
        const restoreScrollFromState = (state: HistoryState) => {
            const scroll = getScrollFromState(state)
            console.log(`Found scroll ${scroll?.toString()}. ${window.location.href}`)
            if (scroll) {
                const [x,y] = scroll
                console.log(`Scroll restored to ${x} ${y}.`)
                window.scrollTo({
                    behavior: 'instant',
                    left:x,
                    top:y
                })
                console.log(`Scroll is ${window.scrollX} ${window.scrollY} after restoring.`)
            }
        }
        const navigationListener = (e: PopStateEvent) => {
            console.log('Popstate started.')
            resetContextAfterNav()
            const state = e.state as HistoryState ?? {}
            restoreScrollFromState(state)
            window.history.replaceState({
                ...state,
                [navThroughHistoryKey]: 1
            }, '')
        }

        const restoreCurrentScrollPosition = () => {
            console.log(`Restoring current scroll position. ${window.location.href}`)
            restoreScrollFromState(window.history.state as HistoryState)
        }
        const workaroundSafariBreaksScrollRestoration = ([x, y]: ScrollPos) => {
            const isScrollRestorationAllowed = () => (((new Date()).getTime() - lastNavigationTime.current.getTime()) < scrollRestorationThreshold)
            console.log(`Check workaround for safari: ${x} ${y} ${isScrollRestorationAllowed()}. Is popstate ${isNavigatingThroughHistory(window.history.state as HistoryState)}. ${window.location.href}`)

            // Sometimes Safari scroll to the start because of unique behavior We restore it back.
            // This case cannot be tested with Playwright, or any other testing library.
            if (x === 0 && y === 0 && isScrollRestorationAllowed() && isNavigatingThroughHistory(window.history.state as HistoryState)) {
                console.log(`Reverting back scroll because browser tried to brake it..`)
                restoreCurrentScrollPosition()
                return true
            }
            return false
        }
        const rememberScrollPosition = (pos: ScrollPos) => {
            console.log(`Remember history scroll to ${pos[0]} ${pos[1]}. Href ${window.location.href}.`)
            cancelDelayedScrollMemoization()
            setCurrentScrollHistory(pos)
        }
        const unmountNavigationListener = () => {
            console.log('Unmount popstate.')

            window.removeEventListener('popstate', navigationListener)
        }
        const mountNavigationListener = () => {
            console.log('Mount popstate.')

            window.addEventListener('popstate', navigationListener,{
                passive:true
            })
        }

        const cancelDelayedScrollMemoization = () => {
            if (scrollMemoTimeoutRef.current) {
                console.log(`Cancelled delayed memoization.`)
                clearTimeout(scrollMemoTimeoutRef.current)
            }
        }

        const scrollMemoizationHandler = (pos: ScrollPos) => {
            const isScrollMemoAllowedNow = () =>{
                const timestamp = getScrollTimestamp((window.history.state as HistoryState))
                if (null === timestamp) {
                    return true
                }
                return (new Date()).getTime() - timestamp > memoizationIntervalLimit
            }

            const isAllowedNow = isScrollMemoAllowedNow()
            console.log(`Handle scroll event. Memo allowed: ${isAllowedNow}.`)

            if (isAllowedNow) {
                rememberScrollPosition(pos)
            } else {
                console.log(`Scroll memoization is not allowed. ${window.location.href}`)
                scrollMemoTimeoutRef.current = setTimeout(() => {
                    rememberScrollPosition(pos)
                    scrollMemoTimeoutRef.current = undefined
                }, memoizationIntervalLimit)
            }
        }
        const scrollListener = () => {
            cancelDelayedScrollMemoization()
            const scroll = getWindowScroll()

            console.log(`Scroll event ${scroll.toString()}. ${window.location.href}`)
            workaroundSafariBreaksScrollRestoration(scroll)

            scrollMemoizationHandler(scroll)


        }
        const mountScrollListener = () => {
            console.log('Scroll listener mounted.')
            window.addEventListener('scroll', scrollListener,{
                passive:true
            })
        }
        const unmountScrollListener = () => {
            console.log('Scroll listener unmounted.')
            window.removeEventListener('scroll', scrollListener)

        }
        mountNavigationListener()
        mountScrollListener()
        return () => {
            unmountNavigationListener()
            unmountScrollListener()
            cancelDelayedScrollMemoization()
        }
    }, [])
}
export default useScrollRestorer
