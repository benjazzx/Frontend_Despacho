function Navbar() {
  return (
    <nav className="rounded-xl w-[250px] min-h-screen bg-teal-600 text-white sticky top-0 p-4 m-4 flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-white rounded-full p-2 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414A1 1 0 0121 11.414V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold leading-tight">Despacho</h2>
          <p className="text-teal-200 text-xs">Dashboard</p>
        </div>
      </div>

      <p className="text-teal-200 text-xs font-semibold uppercase tracking-widest px-3 mb-2">Gestión</p>
      <ul className="space-y-1">
        <li>
          <a href="#" className="flex items-center gap-3 font-semibold py-2.5 px-3 bg-teal-700 rounded-lg text-white shadow-inner">
            <span>📦</span> Despachos
          </a>
        </li>
        <li>
          <a href="#" className="flex items-center gap-3 font-semibold py-2.5 px-3 hover:bg-teal-700 rounded-lg transition-colors duration-200">
            <span>👥</span> Usuarios
          </a>
        </li>
        <li>
          <a href="#" className="flex items-center gap-3 font-semibold py-2.5 px-3 hover:bg-teal-700 rounded-lg transition-colors duration-200">
            <span>📋</span> Productos
          </a>
        </li>
        <li>
          <a href="#" className="flex items-center gap-3 font-semibold py-2.5 px-3 hover:bg-teal-700 rounded-lg transition-colors duration-200">
            <span>⚙️</span> Configuración
          </a>
        </li>
      </ul>

      <div className="mt-auto">
        <div className="bg-teal-700 rounded-xl p-3 text-sm">
          <p className="font-bold text-white text-sm">InnovaTech Chile</p>
          <p className="text-teal-200 text-xs mt-0.5">Sistema de Despachos v1.0</p>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
