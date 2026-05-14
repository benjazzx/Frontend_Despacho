function Reviews() {
  const companies = [
    { name: "Apple", bg: "bg-gray-900", text: "text-white", sub: "Technology" },
    { name: "HyperX", bg: "bg-red-600", text: "text-white", sub: "Gaming" },
    { name: "Logitech", bg: "bg-blue-600", text: "text-white", sub: "Peripherals" },
  ];

  return (
    <div className="bg-white sm:py-10 py-6">
      <div className="mx-auto text-center px-6">
        <h2 className="text-center text-lg font-semibold leading-8 text-gray-900 mb-2">
          Empresas que confían en nosotros
        </h2>
        <p className="text-sm text-gray-500 mb-8">Líderes del mercado tecnológico</p>
        <div className="flex justify-center gap-8 flex-wrap">
          {companies.map((c) => (
            <div key={c.name} className={`${c.bg} ${c.text} rounded-xl px-10 py-4 shadow-md flex flex-col items-center min-w-[130px]`}>
              <span className="font-bold text-xl tracking-wide">{c.name}</span>
              <span className="text-xs opacity-75 mt-1">{c.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Reviews;
