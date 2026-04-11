function Prompt({ onStart }) {
    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <div className="mb-8">
                        <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Ready to connect?</h3>
                        <p className="text-slate-400">Start your video chat to begin the session</p>
                    </div>
                    <button
                        onClick={onStart}
                        className="group relative px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                        <span className="relative z-10">Start Video Chat</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Prompt;