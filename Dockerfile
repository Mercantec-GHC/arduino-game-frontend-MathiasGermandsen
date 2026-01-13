FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["ass-di-stroid-frontend/ass-di-stroid-frontend.csproj", "ass-di-stroid-frontend/"]
RUN dotnet restore "ass-di-stroid-frontend/ass-di-stroid-frontend.csproj"
COPY . .
WORKDIR "/src/ass-di-stroid-frontend"
RUN dotnet build "./ass-di-stroid-frontend.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./ass-di-stroid-frontend.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ass-di-stroid-frontend.dll"]
