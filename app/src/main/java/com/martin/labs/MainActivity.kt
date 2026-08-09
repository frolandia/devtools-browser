package com.martin.labs

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.io.InputStream
import java.nio.charset.StandardCharsets

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var etUrl: EditText
    private lateinit var btnBack: ImageButton
    private lateinit var btnForward: ImageButton
    private lateinit var btnReload: ImageButton
    private lateinit var btnMenu: ImageButton
    private lateinit var btnTabs: ImageButton
    private lateinit var btnBookmark: ImageButton
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var tvTabCount: TextView

    private var isDesktopMode = false
    private var customUserAgent: String? = null
    private var isDarkTheme = true
    private var currentTabId: String = "tab_0"

    private val tabManager = TabManager()
    private val bookmarkStore = BookmarkStore()
    private val historyStore = HistoryStore()

    companion object {
        const val DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        const val DEFAULT_UA =
            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
        const val IPHONE_UA =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
        const val GOOGLEBOT_UA =
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindow(window, false)
        setContentView(R.layout.activity_main)

        applyEdgeToEdgeInsets()
        initViews()
        setupWebView()
        setupNavigation()
        setupSwipeRefresh()

        webView.loadUrl("https://google.com")
    }

    private fun applyEdgeToEdgeInsets() {
        val root = findViewById<View>(R.id.rootLayout)
        val toolbar = findViewById<View>(R.id.toolbar)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            toolbar.updatePadding(top = systemBars.top)
            root.updatePadding(bottom = systemBars.bottom)
            insets
        }
    }

    private fun initViews() {
        webView = findViewById(R.id.webView)
        etUrl = findViewById(R.id.etUrl)
        btnBack = findViewById(R.id.btnBack)
        btnForward = findViewById(R.id.btnForward)
        btnReload = findViewById(R.id.btnReload)
        btnMenu = findViewById(R.id.btnMenu)
        btnTabs = findViewById(R.id.btnTabs)
        btnBookmark = findViewById(R.id.btnBookmark)
        progressBar = findViewById(R.id.progressBar)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        tvTabCount = findViewById(R.id.tvTabCount)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.userAgentString = DEFAULT_UA
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportMultipleWindows(true)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        WebView.setWebContentsDebuggingEnabled(true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                url?.let {
                    if (!etUrl.hasFocus()) etUrl.setText(it)
                    historyStore.addEntry(it, view?.title ?: "")
                    tabManager.updateTab(currentTabId, it)
                }
                progressBar.visibility = View.VISIBLE
                btnReload.setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false
                btnReload.setImageResource(android.R.drawable.ic_popup_sync)
                CookieManager.getInstance().flush()
                injectScraperBridge()
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return handleUrlLoading(view, url)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return handleUrlLoading(view, request?.url?.toString())
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                title?.let { tabManager.updateTabTitle(currentTabId, it) }
            }
        }
    }

    private fun setupNavigation() {
        btnBack.setOnClickListener { if (webView.canGoBack()) webView.goBack() }
        btnForward.setOnClickListener { if (webView.canGoForward()) webView.goForward() }
        btnReload.setOnClickListener {
            if (progressBar.visibility == View.VISIBLE) webView.stopLoading() else webView.reload()
        }
        btnMenu.setOnClickListener { showFeatureMenu() }
        btnTabs.setOnClickListener { showTabManager() }
        btnBookmark.setOnClickListener { toggleBookmark() }

        etUrl.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE ||
                (event?.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER)) {
                loadUrlFromInput()
                true
            } else false
        }
    }

    private fun setupSwipeRefresh() {
        swipeRefresh.setOnRefreshListener { webView.reload() }
    }

    private fun loadUrlFromInput() {
        var url = etUrl.text.toString().trim()
        if (url.isNotEmpty()) {
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = if (url.contains(".") && !url.contains(" ")) "https://$url"
                else "https://www.google.com/search?q=$url"
            }
            webView.loadUrl(url)
        }
    }

    private fun handleUrlLoading(view: WebView?, url: String?): Boolean {
        if (url == null) return false
        if (url.startsWith("http://") || url.startsWith("https://")) return false

        if (url.startsWith("intent://")) {
            try {
                val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                if (intent != null) {
                    if (packageManager.resolveActivity(intent, 0) != null) {
                        startActivity(intent)
                        return true
                    }
                    val fallbackUrl = intent.getStringExtra("browser_fallback_url")
                    if (!fallbackUrl.isNullOrEmpty()) {
                        view?.loadUrl(fallbackUrl)
                        return true
                    }
                    val packageName = intent.`package`
                    if (!packageName.isNullOrEmpty()) {
                        showSchemeFallbackDialog("App Not Installed", "App '$packageName' not installed.", "https://play.google.com/store/apps/details?id=$packageName", url)
                        return true
                    }
                }
            } catch (e: Exception) { e.printStackTrace() }
            showSchemeFallbackDialog("Open External Link", "Could not process intent.", null, url)
            return true
        }

        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            if (packageManager.resolveActivity(intent, 0) != null) {
                startActivity(intent)
                true
            } else {
                showSchemeFallbackDialog("App Required", "No app for: $url", null, url)
                true
            }
        } catch (e: Exception) {
            showSchemeFallbackDialog("Scheme Error", "Failed to launch link.", null, url)
            true
        }
    }

    private fun showSchemeFallbackDialog(title: String, message: String, fallbackUrl: String?, rawLink: String) {
        val options = if (fallbackUrl != null) arrayOf("Open Fallback URL", "Copy Link", "Share Link")
        else arrayOf("Copy Link", "Share Link")

        AlertDialog.Builder(this)
            .setTitle(title).setMessage(message)
            .setItems(options) { _, which ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                if (fallbackUrl != null) {
                    when (which) {
                        0 -> webView.loadUrl(fallbackUrl)
                        1 -> { clipboard.setPrimaryClip(ClipData.newPlainText("Link", rawLink)); Toast.makeText(this, "Copied!", Toast.LENGTH_SHORT).show() }
                        2 -> shareText(rawLink)
                    }
                } else {
                    when (which) {
                        0 -> { clipboard.setPrimaryClip(ClipData.newPlainText("Link", rawLink)); Toast.makeText(this, "Copied!", Toast.LENGTH_SHORT).show() }
                        1 -> shareText(rawLink)
                    }
                }
            }.setNegativeButton("Cancel", null).show()
    }

    private fun shareText(text: String) {
        val sendIntent = Intent().apply { action = Intent.ACTION_SEND; putExtra(Intent.EXTRA_TEXT, text); type = "text/plain" }
        startActivity(Intent.createChooser(sendIntent, "Share via"))
    }

    private fun injectScraperBridge() {
        try {
            val inputStream = assets.open("scraper_bridge.js")
            val buffer = ByteArray(inputStream.available()); inputStream.read(buffer); inputStream.close()
            webView.evaluateJavascript(String(buffer, StandardCharsets.UTF_8), null)
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun injectNativeDevTools() {
        try {
            val inputStream = assets.open("native_devtools/devtools_core.js")
            val buffer = ByteArray(inputStream.available()); inputStream.read(buffer); inputStream.close()
            webView.evaluateJavascript(String(buffer, StandardCharsets.UTF_8), null)
            Toast.makeText(this, "Native DevTools Activated!", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) { e.printStackTrace(); Toast.makeText(this, "Failed to inject DevTools", Toast.LENGTH_SHORT).show() }
    }

    private fun showFeatureMenu() {
        val desktopLabel = if (isDesktopMode) "Switch to Mobile View" else "Switch to Desktop Site"
        val themeLabel = if (isDarkTheme) "Switch to Light Theme" else "Switch to Dark Theme"

        val options = arrayOf("Launch Native DevTools", "Scrape Tools", "Copy All Cookies", desktopLabel, themeLabel, "Change User-Agent", "Find in Page", "Bookmarks", "Browsing History", "Take Screenshot", "Go to Home")

        AlertDialog.Builder(this).setTitle("Browser & Scraper Tools").setItems(options) { _, which ->
            when (which) {
                0 -> injectNativeDevTools()
                1 -> showScraperSubMenu()
                2 -> copyAllCookiesAndStorage()
                3 -> toggleDesktopMode()
                4 -> toggleTheme()
                5 -> showUserAgentDialog()
                6 -> showFindInPageDialog()
                7 -> showBookmarks()
                8 -> showHistory()
                9 -> takeScreenshot()
                10 -> webView.loadUrl("https://google.com")
            }
        }.show()
    }

    private fun showScraperSubMenu() {
        val opts = arrayOf("Page Metadata", "All Links (JSON)", "All Media", "HTML Tables (JSON)", "Cookies + Storage", "Clean Page Text", "Raw HTML Source", "CSS Selector Query", "Performance Metrics", "All Forms & Inputs")
        AlertDialog.Builder(this).setTitle("Scraper Tools").setItems(opts) { _, which ->
            when (which) {
                0 -> runScraperJS("ScraperBridge.getMetaData()", "Page Metadata")
                1 -> runScraperJS("ScraperBridge.getAllLinks()", "Extracted Links")
                2 -> runScraperJS("ScraperBridge.getAllMedia()", "Extracted Media")
                3 -> runScraperJS("ScraperBridge.getTables()", "Extracted Tables")
                4 -> runScraperJS("ScraperBridge.getStorageAndCookies()", "Storage & Cookies")
                5 -> runScraperJS("ScraperBridge.getText()", "Clean Text")
                6 -> runScraperJS("ScraperBridge.getHTML()", "HTML Source")
                7 -> showCustomSelectorDialog()
                8 -> runScraperJS("ScraperBridge.getPerformanceMetrics()", "Performance")
                9 -> runScraperJS("ScraperBridge.getAllForms()", "Forms & Inputs")
            }
        }.show()
    }

    private fun runScraperJS(jsExpression: String, title: String) {
        injectScraperBridge()
        webView.evaluateJavascript(jsExpression) { value ->
            val result = if (value != null && value.startsWith("\"") && value.endsWith("\"")) unescapeJSString(value) else value ?: "No data"
            showResultDialog(title, result)
        }
    }

    private fun unescapeJSString(s: String?): String {
        if (s == null) return ""
        return try {
            org.json.JSONObject.quote(s).substring(1, s.length - 1).replace("\\\"", "\"").replace("\\n", "\n").replace("\\r", "").replace("\\t", "\t").replace("\\\\", "\\")
        } catch (e: Exception) { s }
    }

    private fun showCustomSelectorDialog() {
        val input = EditText(this).apply { hint = "e.g. div.product-title"; setPadding(30, 20, 30, 20) }
        AlertDialog.Builder(this).setTitle("CSS Selector Query").setMessage("Masukkan CSS Selector:").setView(input)
            .setPositiveButton("Scrape") { _, _ ->
                val selector = input.text.toString().trim()
                if (selector.isNotEmpty()) runScraperJS("ScraperBridge.querySelectorAllData('${selector.replace("'", "\\'")}')", "Result: $selector")
            }.setNegativeButton("Batal", null).show()
    }

    private fun showResultDialog(title: String, data: String) {
        val text = EditText(this).apply { setText(data); isFocusable = true; setSelectAllOnFocus(true); setTextIsSelectable(true); maxLines = 20 }
        AlertDialog.Builder(this).setTitle(title).setView(text)
            .setPositiveButton("Copy") { _, _ ->
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText(title, data))
                Toast.makeText(this, "Disalin!", Toast.LENGTH_SHORT).show()
            }.setNegativeButton("Tutup", null).show()
    }

    private fun copyAllCookiesAndStorage() {
        val currentUrl = webView.url ?: "https://example.com"
        val rawCookies = CookieManager.getInstance().getCookie(currentUrl)
        if (rawCookies.isNullOrEmpty()) { Toast.makeText(this, "Tidak ada Cookie!", Toast.LENGTH_LONG).show(); return }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Cookies", rawCookies))
        Toast.makeText(this, "Cookie disalin!", Toast.LENGTH_LONG).show()
    }

    private fun toggleDesktopMode() {
        isDesktopMode = !isDesktopMode
        val settings = webView.settings
        if (isDesktopMode) { settings.userAgentString = DESKTOP_UA; Toast.makeText(this, "Desktop Mode", Toast.LENGTH_SHORT).show() }
        else { settings.userAgentString = customUserAgent ?: DEFAULT_UA; Toast.makeText(this, "Mobile View", Toast.LENGTH_SHORT).show() }
        webView.reload()
    }

    private fun toggleTheme() {
        isDarkTheme = !isDarkTheme
        val js = if (isDarkTheme) "document.documentElement.style.setProperty('--bg','#0d1117');" else "document.documentElement.style.setProperty('--bg','#ffffff');"
        webView.evaluateJavascript(js, null)
        Toast.makeText(this, if (isDarkTheme) "Dark Theme" else "Light Theme", Toast.LENGTH_SHORT).show()
    }

    private fun showUserAgentDialog() {
        val uas = arrayOf("Android Chrome (Default)", "Windows Chrome Desktop", "iPhone Safari", "Googlebot", "Custom")
        AlertDialog.Builder(this).setTitle("User-Agent").setItems(uas) { _, which ->
            when (which) {
                0 -> applyUserAgent(DEFAULT_UA)
                1 -> applyUserAgent(DESKTOP_UA)
                2 -> applyUserAgent(IPHONE_UA)
                3 -> applyUserAgent(GOOGLEBOT_UA)
                4 -> promptCustomUserAgent()
            }
        }.show()
    }

    private fun applyUserAgent(ua: String) { customUserAgent = ua; webView.settings.userAgentString = ua; webView.reload() }

    private fun promptCustomUserAgent() {
        val input = EditText(this).apply { setText(webView.settings.userAgentString) }
        AlertDialog.Builder(this).setTitle("Custom UA").setView(input)
            .setPositiveButton("Simpan") { _, _ -> val ua = input.text.toString().trim(); if (ua.isNotEmpty()) applyUserAgent(ua) }
            .setNegativeButton("Batal", null).show()
    }

    private fun showFindInPageDialog() {
        val input = EditText(this).apply { hint = "Search text..." }
        AlertDialog.Builder(this).setTitle("Find in Page").setView(input)
            .setPositiveButton("Cari") { _, _ -> val q = input.text.toString(); if (q.isNotEmpty()) webView.findAllAsync(q) }
            .setNeutralButton("Clear") { _, _ -> webView.clearMatches() }
            .setNegativeButton("Batal", null).show()
    }

    private fun toggleBookmark() {
        val url = webView.url ?: return; val title = webView.title ?: url
        if (bookmarkStore.isBookmarked(url)) { bookmarkStore.remove(url); Toast.makeText(this, "Bookmark removed", Toast.LENGTH_SHORT).show() }
        else { bookmarkStore.add(url, title); Toast.makeText(this, "Bookmark added!", Toast.LENGTH_SHORT).show() }
        btnBookmark.alpha = if (bookmarkStore.isBookmarked(url)) 1.0f else 0.5f
    }

    private fun showBookmarks() {
        val bookmarks = bookmarkStore.getAll()
        if (bookmarks.isEmpty()) { Toast.makeText(this, "No bookmarks", Toast.LENGTH_SHORT).show(); return }
        AlertDialog.Builder(this).setTitle("Bookmarks").setItems(bookmarks.map { it.title }.toTypedArray()) { _, which -> webView.loadUrl(bookmarks[which].url) }.setNegativeButton("Close", null).show()
    }

    private fun showHistory() {
        val history = historyStore.getAll()
        if (history.isEmpty()) { Toast.makeText(this, "No history", Toast.LENGTH_SHORT).show(); return }
        AlertDialog.Builder(this).setTitle("History").setItems(history.map { it.title.ifEmpty { it.url } }.toTypedArray()) { _, which -> webView.loadUrl(history[which].url) }
            .setNeutralButton("Clear") { _, _ -> historyStore.clear(); Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show() }
            .setNegativeButton("Close", null).show()
    }

    private fun showTabManager() {
        val tabs = tabManager.getAllTabs()
        AlertDialog.Builder(this).setTitle("Tabs (${tabs.size})").setItems(tabs.map { "${it.title.take(30)} — ${it.url.take(40)}" }.toTypedArray()) { _, which -> currentTabId = tabs[which].id; webView.loadUrl(tabs[which].url) }
            .setPositiveButton("New Tab") { _, _ -> val newTab = tabManager.addTab("https://google.com", "New Tab"); currentTabId = newTab.id; webView.loadUrl("https://google.com"); tvTabCount.text = tabManager.getAllTabs().size.toString() }
            .setNeutralButton("Close Tab") { _, _ ->
                tabManager.removeTab(currentTabId); val remaining = tabManager.getAllTabs()
                if (remaining.isEmpty()) { val newTab = tabManager.addTab("https://google.com", "Google"); currentTabId = newTab.id; webView.loadUrl("https://google.com") }
                else { currentTabId = remaining[0].id; webView.loadUrl(remaining[0].url) }
                tvTabCount.text = tabManager.getAllTabs().size.toString()
            }.setNegativeButton("Close", null).show()
    }

    private fun takeScreenshot() { Toast.makeText(this, "Screenshot initiated!", Toast.LENGTH_SHORT).show() }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else { @Suppress("DEPRECATION") super.onBackPressed() }
    }
}

data class TabInfo(val id: String, var url: String, var title: String)
data class BookmarkInfo(val url: String, val title: String)
data class HistoryInfo(val url: String, val title: String, val timestamp: Long = System.currentTimeMillis())

class TabManager {
    private val tabs = mutableListOf<TabInfo>()
    private var counter = 0
    init { tabs.add(TabInfo("tab_0", "https://google.com", "Google")) }
    fun addTab(url: String, title: String): TabInfo { counter++; val tab = TabInfo("tab_$counter", url, title); tabs.add(tab); return tab }
    fun removeTab(id: String) { tabs.removeAll { it.id == id } }
    fun updateTab(id: String, url: String) { tabs.find { it.id == id }?.url = url }
    fun updateTabTitle(id: String, title: String) { tabs.find { it.id == id }?.title = title }
    fun getAllTabs(): List<TabInfo> = tabs.toList()
}

class BookmarkStore {
    private val bookmarks = mutableListOf<BookmarkInfo>()
    fun add(url: String, title: String) { if (!isBookmarked(url)) bookmarks.add(BookmarkInfo(url, title)) }
    fun remove(url: String) { bookmarks.removeAll { it.url == url } }
    fun isBookmarked(url: String): Boolean = bookmarks.any { it.url == url }
    fun getAll(): List<BookmarkInfo> = bookmarks.toList()
}

class HistoryStore {
    private val history = mutableListOf<HistoryInfo>()
    private val maxEntries = 100
    fun addEntry(url: String, title: String) { history.add(0, HistoryInfo(url, title)); if (history.size > maxEntries) history.removeAt(history.size - 1) }
    fun getAll(): List<HistoryInfo> = history.toList()
    fun clear() { history.clear() }
}
